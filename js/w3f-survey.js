var CLIENT_ID = '830533464714-j7aafbpjac8cfgmutg83gu2tqgr0n5mm.apps.googleusercontent.com';
var SCOPE = 'https://spreadsheets.google.com/feeds';

// Gimme a range op!
Array.prototype.range = function(n) {
	return Array.apply(null, Array(n)).map(function (_, i) {return i;});
}

angular.module('W3FODB', [ 'GoogleSpreadsheets', 'ngCookies', 'ngRoute' ])
	.config([ '$routeProvider', '$locationProvider', function($routeProvider, $locationProvider) {
		$routeProvider.when('/:answerKey?', {
			controller: 'W3FSurvey',
			templateUrl: 'tpl/survey.html'
		});

		$locationProvider.html5Mode(true);
	} ])
	.controller('W3FSurvey', [ 'spreadsheets', '$scope', '$rootScope', '$routeParams', '$interval', function(gs, $scope, $rootScope, $routeParams, $interval) {	
		if(!$routeParams.answerKey) {
			return;
		}

		var answerKey = $routeParams.answerKey;
		var answerSheet;

		// Try to get answer sheet once an accessToken is found
		$rootScope.$watch('accessToken', function(accessToken) {
			if(!accessToken) {
				return;
			}

			// Try to get answer sheet
			gs.getSheets(answerKey, accessToken).then(function(sheets) {
				if(!sheets['Control']) {
					$scope.error = "Couldn't find control sheet";
					return;
				}

				if(!sheets['Answers']) {
					$scope.error = "Couldn't find answers sheet";
					return;
				}

				answerSheet = sheets['Answers'];

				gs.getRows(answerKey, sheets['Control'], accessToken).then(function(config) {
					if(config.length == 0) {
						$scope.error = "Couldn't determine country!";
					}

					$rootScope.country = config[0].country;
				});

				// Populate answers
				gs.getRows(answerKey, sheets['Answers'], accessToken).then(function(answers) {
					angular.forEach(answers, function(answer) {
						if(!$rootScope.responses[answer.questionid]) {
							$rootScope.responses[answer.questionid] = {};
						}
						
						$rootScope.responseLinks[answer.questionid] = answer[':links'];

						var response = {};

						for(var col in answer) {
							// Ignore metadata fields starting with :
							if(col[0] != ':') {
								response[col] = answer[col];
							}
						}

						// Collapse multi-part responses into arrays
						angular.forEach([ 'example' ], function(field) {
							answer[field] = [];

							for(var i = 0; i <= 10; i++) {
								var id = field + i;

								if(typeof answer[id] == 'string' && row[id] != '' ) {
									answer[field].push(answer[id]);
								}
							}
						});

						$rootScope.oldResponses[answer.questionid] = angular.copy(response);
						$rootScope.responses[answer.questionid] = response;
					});
				});
			});

			// Queue up changes as answers are updated
			var queue = {}, processQueue = {};

			$scope.$on('update-answer', function(ev, qid, newValues) {
				queue[qid] = newValues;
			});

			$interval(function() {
				var j;
				
				for(var qid in queue) {
					var values = $rootScope.responses[qid];

					values = $.extend({}, {
						response: values.response, 
						justification: values.justification,
						confidence: values.confidence,
						examples: values.examples,
					}, { 
						questionid: qid
					});

					if(processQueue[qid]) {
						processQueue[qid].abort();
					}

					if($rootScope.responseLinks[qid]) {
						processQueue[qid] = gs.updateRow($rootScope.responseLinks[qid].edit, values, accessToken);
					}
					else {
						processQueue[qid] = gs.insertRow(answerSheet, values, accessToken);
					}

					processQueue[qid].then(function(row) {
						$rootScope.responseLinks[qid] = row[':links'];

						var response = {};

						for(var col in row) {
							// Ignore metadata fields starting with :
							if(col[0] != ':') {
								response[col] = row[col];
							}
						}

						$rootScope.oldResponses[qid] = response;
					})['finally'](function() {
						delete processQueue[qid];
					});
				}

				queue = {};
			}, 3000);
		});
	} ])
	.controller('W3FSurveyController', [ 'spreadsheets', '$scope', '$rootScope', '$q', '$cookies', '$routeParams', function(gs, $scope, $rootScope, $q, $cookies, $routeParams) {	
		var masterKey = '0AokPSYs1p9vhdEdjeUluaThWc2RqQnI0c21oN1FaYUE';

		$scope.sectionOrder = [];
		$scope.sections = {};

		// Questions by Section ID
		$scope.questions = {};

		// Responses by question ID, as a watched scope model
		//
		// TODO: Load from Answer sheet
		$rootScope.responses = {};

		// Responses before any changes. Necessary because of bugs in $scope.$watchCollection 
		// (https://github.com/angular/angular.js/pull/5661)
		$rootScope.oldResponses = {};

		// Response URLs by question ID
		$rootScope.responseLinks = {};

		// Allow use of "Sum" function for summing sub-question response values (the numbers, anyway)
		$rootScope.sum = function(questions) {
			var sum = 0;

			angular.forEach(questions, function(question) {
				var number = parseInt($rootScope.responses[question.questionid].response);

				if(!isNaN(number)) {
					sum += number;
				}

				if(question.subquestions.length) {
					sum += $scope.sum(question.subquestions);
				}
			});

			return sum;
		};

		// Set up an initial page
		$scope.activeSection = $cookies.section;

		// Navigate to a different section
		$scope.navigate = function(section) {
			$scope.activeSection = $cookies.section = section;
		}

		var populate = function(sheets) {
			var deferred = $q.defer();

			// Populate "Sections" from sections sheet
			var populateSections = function(rows) {
				angular.forEach(rows, function(row) {
					$scope.sectionOrder.push(row.section);

					// Default to first section
					if(!$scope.activeSection) {
						$scope.activeSection = row.section;
					}

					$scope.sections[row.section] = row;
					$scope.sections[row.section].questions = [];
				});
			};

			// Populate "Questions" from questions sheet
			var populateQuestions = function(rows) {
				// Track questions by ID to form parent relationships
				var questionsById = {};

				angular.forEach(rows, function(row) {
					if(!$scope.sections[row.section]) {
						return;
					}

					// Gather various fields into arrays. Original fields are kept, this is just for ease of templates
					angular.forEach([ 'option', 'guidance', 'supporting' ], function(field) {
						row[field] = [];

						for(var i = 0; i <= 10; i++) {
							var id = field + i;

							if(typeof row[id] == 'string' && row[id] != '' ) {
								row[field].push({ weight: i, id: id, content: row[id] });
							}
						}
					});

					// Extract valid options from supporting information fields
					angular.forEach(row.supporting, function(option) {
						var matches = option.content.match(/^\s*(?:(\d+(?:\s*,\s*\d+)*)\s*;)?\s*(.+)\s*$/i);

						option.values = matches[1] && matches[1].split(/\s*,\s*/);
						option.content = matches[2];
					});

					// Make sure responses have somewhere to go
					if(!$rootScope.responses[row.questionid]) {
						$rootScope.responses[row.questionid] = {};
						$rootScope.oldResponses[row.questionid] = {};
					}

					// Watch responses to add any changes to the save queue
					// BUG: oldValue and newValue are the same in this call from $watchCollection -
					// See: https://github.com/angular/angular.js/issues/2621. 
					$rootScope.$watchCollection("responses['" + row.questionid + "']", function(oldValue, newValue) {
						if(!angular.equals(newValue, $scope.oldResponses[row.questionid])) {
							$rootScope.$broadcast('update-answer', row.questionid, newValue);
						}
					});

					// Nest subquestions here
					row.subquestions = [];

					// Save a reference to the question by ID
					$scope.questions[row.questionid] = row;

					// Child questions, assume parent has already been registered.
					if(row.parentid) {
						$scope.questions[row.parentid].subquestions.push(row);
					}
					// Top-level question
					else {
						$scope.sections[row.section].questions.push(row);
					}
				});

				deferred.resolve();
			}

			gs.getRows(masterKey, sheets['Sections'], $rootScope.accessToken).then(function(sections) {
				populateSections(sections);

				gs.getRows(masterKey, sheets['Questions'], $rootScope.accessToken).then(function(questions) {
					populateQuestions(questions);
				});
			});

			return deferred.promise;
		};

		window.authenticated = function(authResult) {
			if(!authResult || authResult.error) {
				$scope.show_signin = true;
				return;
			}

			if(!authResult.status.signed_in || $scope.accessToken) {
				return;
			}

			$rootScope.accessToken = authResult.access_token;

			$scope.loading = true;

			// Get sheets in master sheet,
			gs.getSheets(masterKey, $rootScope.accessToken).then(function(sheets) {
				// Check for required 'Sections' sheet
				if(!sheets['Sections']) {
					$scope.loading = false;
					$scope.error = "Could't find 'Sections' sheet!";
					return;
				}

				// Load the survey
				populate(sheets)['finally'](function() {
					$scope.loading = false;
					$scope.loaded = true;

					$scope.$broadcast('sections-loaded');
				});
			});
		};
	} ])
	.directive('withRail', [ '$timeout', function($timeout) {
		return {
			link: function($scope, element, attrs) {
				$scope.$on('sections-loaded', function() {
					$timeout(function() {
						var $sections = $('#sections');
						var $ul = $sections.find('ul');

						$sections.width($ul.width());
						$sections.height($ul.height());

						$(element).css('padding-left', $ul.width());
					}, 0, false);
				});
			}
		}
	} ])
	.directive('flexibleList', [ function() {
		return {
			replace: true,
			restrict: 'E',
			link: function($scope, element, attrs) {
				// Force this model to be an array
				if(typeof $scope.$eval(attrs.ngModel) == 'undefined') {
					$scope.$eval(attrs.ngModel + '=[]');
				}

				function render() {
					var $ul = $('<ul>');

					angular.forEach($scope.$eval(attrs.ngModel), function(item) {
						var 
							$li = $('<li>'),
							$del = $('<a class="delete-item">x</a>');
							$input = $('<input class="item">');

						$input.val(item);
						$li.append($del);
						$li.append($input);
						$ul.append($li);

						$del.on('click', function() {
							var index = $ul.find('.delete-item').index(this);
							$scope.$eval(attrs.ngModel + '.splice(' + index + ',1)');
							render();
						});
					});

					var $li = $('<li>');
					var $add = $('<a class="add-item">+ add</a>');
					
					$li.append($add);
					$ul.append($li);

					$add.on('click', function() {
						$scope.$eval(attrs.ngModel + '.push("")');
						render();
					});

					$ul.on('change keyup', 'input', function() {
						var index = $ul.find('input').index(this);

						$scope.$eval(attrs.ngModel + '[' + index + ']=' + JSON.stringify(this.value));
					});

					element.html('');
					element.append($ul);
				}

				render();
			}
		}
	} ]);

window.gapi_loaded = function() {
	window.GAPI_LOADED = true;

	// Try to authenticate immediately
	gapi.auth.authorize({
		client_id: CLIENT_ID,
		scope: SCOPE,
		immediate: true
	}, window.authenticated);

	// Render the sign-in button
	gapi.signin.render(document.getElementById('signin-button'), {
		clientid: CLIENT_ID,
		scope: SCOPE,
		cookiepolicy: 'single_host_origin',
		callback: 'authenticated'
	});
};
