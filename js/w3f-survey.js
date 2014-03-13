var CLIENT_ID = '830533464714-j7aafbpjac8cfgmutg83gu2tqgr0n5mm.apps.googleusercontent.com';
var SCOPE = 'https://spreadsheets.google.com/feeds';

// Gimme a range op!
Array.prototype.range = function(n) {
	return Array.apply(null, Array(n)).map(function (_, i) {return i;});
}

angular.module('W3FWIS', [ 'GoogleSpreadsheets', 'ngCookies', 'ngRoute', 'ngSanitize' ])
	// Setup route. There's only one route, and it's /<answerSheetKey>
	.config([ '$routeProvider', '$locationProvider', function($routeProvider, $locationProvider) {
		$routeProvider.when('/:answerKey?', {
			controller: 'W3FSurveyController',
			templateUrl: 'tpl/survey.html'
		});

		$locationProvider.html5Mode(true);
	} ])

	// Create "country" filter
	.filter('country', [ '$rootScope', function( $rootScope ) {
		return function(input) {
			return input.replace('[country]', $rootScope.country);
		}
	} ])

	// Create "markdown" filter
	.filter('markdown', function( $rootScope ) {
		return function(input) {
			return markdown.toHTML(input);
		}
	})

	// Top-level controller
	.controller('W3FSurveyController', [ 'spreadsheets', '$scope', '$rootScope', '$q', '$cookies', '$routeParams', '$interval', function(gs, $scope, $rootScope, $q, $cookies, $routeParams, $interval) {	
		var masterKey = '0AokPSYs1p9vhdEdjeUluaThWc2RqQnI0c21oN1FaYUE';
		var answerKey = $routeParams.answerKey;
		var answerSheet;

		// Section order and descriptors
		$rootScope.sectionOrder = [];
		$rootScope.sections = {};

		// Questions by Section ID
		$rootScope.questions = {};

		// Responses by question ID, as a watched scope model
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

				if(question.subquestions && question.subquestions.length) {
					sum += $rootScope.sum(question.subquestions);
				}
			});

			return sum;
		};

		// Set up an initial page
		$rootScope.activeSection = $cookies.section;

		// Navigate to a different section
		$rootScope.navigate = function(section) {
			$rootScope.activeSection = $cookies.section = section;
			window.scrollTo(0,0);
		}

		//
		// Manage updating the answer sheet 
		// 

		// Queue up changes as answers are updated
		var queue = {};
		
		// Keep timers for processes here, cancelling pending changes to an answer
		// when newer changes have occured
		var processQueue = {};

		// Three-second timer
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
					processQueue[qid] = gs.updateRow($rootScope.responseLinks[qid].edit, values, $rootScope.accessToken);
				}
				else {
					processQueue[qid] = gs.insertRow(answerSheet, values, $rootScope.accessToken);
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

		var populate = function(sheets) {
			var deferred = $q.defer();

			// Populate "Sections" from sections sheet
			var populateSections = function(rows) {
				angular.forEach(rows, function(section) {
					$rootScope.sectionOrder.push(section.section);

					// Default to first section
					if(!$scope.activeSection) {
						$scope.activeSection = section.section;
					}

					$rootScope.sections[section.section] = section;
					$rootScope.sections[section.section].questions = [];
				});
			};

			// Populate "Questions" from questions sheet
			var populateQuestions = function(rows) {
				angular.forEach(rows, function(question) {
					if(!$scope.sections[question.section]) {
						return;
					}

					// Gather various fields into arrays. Original fields are kept, this is just for ease of templates
					angular.forEach([ 'option', 'guidance', 'supporting' ], function(field) {
						question[field] = [];

						for(var i = 0; i <= 10; i++) {
							var id = field + i;

							if(typeof question[id] == 'string' && question[id] != '' ) {
								question[field].push({ weight: i, id: id, content: question[id] });
							}
						}
					});

					// Extract valid options from supporting information fields
					angular.forEach(question.supporting, function(option) {
						var matches = option.content.match(/^\s*(?:(\d+(?:\s*,\s*\d+)*)\s*;)?\s*(.+)\s*$/i);

						option.values = matches[1] && matches[1].split(/\s*,\s*/);
						option.content = matches[2];
					});

					$rootScope.responses[question.questionid] = {};

					// Update progress bar as responses are given
					$rootScope.$watchCollection('responses["' + question.questionid + '"]', function(newValue) {
						$rootScope.$broadcast('response-updated');
					});

					// Nest subquestions here
					question.subquestions = [];

					// Save a reference to the question by ID
					$rootScope.questions[question.questionid] = question;

					// Child questions, assume parent has already been registered.
					if(question.parentid) {
						$rootScope.questions[question.parentid].subquestions.push(question);
					}
					// Top-level question in this section
					else {
						$rootScope.sections[question.section].questions.push(question);
					}
				});
			}

			// Load answer sheet and populate responses model
			var loadAnswers = function() {
				// Try to get answer sheet
				gs.getSheets(answerKey, $rootScope.accessToken).then(function(sheets) {
					if(!sheets['Control']) {
						$scope.error = "Couldn't find control sheet";
						return;
					}

					if(!sheets['Answers']) {
						$scope.error = "Couldn't find answers sheet";
						return;
					}

					// Get any answer metadata from control sheet
					gs.getRows(answerKey, sheets['Control'], $rootScope.accessToken).then(function(config) {
						if(config.length == 0) {
							$scope.error = "Couldn't determine country!";
						}

						$rootScope.country = config[0].country;
					});

					// Populate answers. This can be done in parralel with control data load
					// since the data sets are distinct
					gs.getRows(answerKey, sheets['Answers'], $rootScope.accessToken).then(function(answers) {
						angular.forEach(answers, function(answer) {
							if(!$rootScope.questions[answer.questionid]) {
								console.log("Answer with qid=" + answer.questionid + " does not correspond to any survey question");
								return;
							}

							$rootScope.responseLinks[answer.questionid] = answer[':links'];

							var response = $rootScope.responses[answer.questionid] 

							// Copy all response properties from sheet into row
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

									if(typeof answer[id] == 'string' && answer[id] != '' ) {
										answer[field].push(answer[id]);
									}
								}
							});

							$rootScope.oldResponses[answer.questionid] = _.clone(response);
						});

						// Only now that the answer sheet has been loaded
						// do we watch for changes to the responses that might
						// come from the user.
						//
						// Watch responses to add any changes to the save queue
						//
						// BUG: oldValue and newValue are the same in this call from $watchCollection -
						// See: https://github.com/angular/angular.js/issues/2621. 
						_.each(_.keys($rootScope.questions), function(qid) {
							$rootScope.$watchCollection("responses['" + qid + "']", function(oldValue, newValue) {
								if(!angular.equals(newValue, $rootScope.oldResponses[qid])) {
									queue[qid] = newValue;
									$rootScope.oldResponses[qid] = newValue;
								}
							});
						});

						deferred.resolve();
					});
				});
			}

			gs.getRows(masterKey, sheets['Sections'], $rootScope.accessToken).then(function(sections) {
				populateSections(sections);

				gs.getRows(masterKey, sheets['Questions'], $rootScope.accessToken).then(function(questions) {
					populateQuestions(questions);

					if(answerKey) {
						loadAnswers();
					}
					else {
						deferred.resolve();
					}
				});
			});

			return deferred.promise;
		};

		window.authenticated = function(authResult) {
			if(!authResult || authResult.error) {
				$scope.show_signin = true;
				return;
			}

			if(!authResult.status.signed_in || $rootScope.accessToken) {
				return;
			}

			$rootScope.accessToken = authResult.access_token;
			$scope.show_signin = false;

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

					$rootScope.$broadcast('sections-loaded');
				});
			});
		};
	} ])

	// Create a rail exactly the size of the sections menu
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

	// Create a rail exactly the size of the sections menu
	.directive('updateOnResponse', [ '$timeout', function($timeout) {
		return {
			link: function($scope, element, attrs) {
				$scope.$on('response-updated', function() {
					$scope.sectionAnswers = [];
					$scope.sectionQuestions = _.filter($scope.questions, function(q) { 
						if(q.section == $scope.section) {
							if(!_.isEmpty($scope.responses[q.questionid].response)) {
								$scope.sectionAnswers.push($scope.responses[q.questionid]);
							}

							return true;
						}

						return false;
					});
				});
			}
		}
	} ])

	// Allow for insert/update/delete operations on a list of text inputs
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
