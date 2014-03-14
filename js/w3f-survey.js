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

		// Response URLs by question ID
		$rootScope.responseLinks = {};

		// Notes by Question ID
		$rootScope.notes = {};

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
			var size = _.size(queue);

			if(size == 0) {
				return;
			}

			$rootScope.status = {
				saving: size
			};

			_.each(queue, function(response, qid) {
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

					$rootScope.status = {
						message: "Last saved " + (function(d) { return d.toDateString() + ", " + d.toLocaleTimeString() })(new Date()),
						clear: 3000
					};
				}, function(message) {
					$rootScope.status = {
						error: "Failed to save changes for question " + qid
					};
				})['finally'](function() {
					delete processQueue[qid];
				});
			});

			queue = {};
		}, 3000);

		var populate = function(sheets) {
			var deferred = $q.defer();

			// Populate "Sections" from sections sheet
			var populateSections = function(rows) {
				angular.forEach(rows, function(section) {
					$rootScope.sectionOrder.push(section.section);

					// Default to first section
					if(!$rootScope.activeSection) {
						$rootScope.activeSection = section.section;
					}

					$rootScope.sections[section.section] = section;
					$rootScope.sections[section.section].questions = [];
				});
			};

			// Populate "Questions" from questions sheet
			var populateQuestions = function(rows) {
				angular.forEach(rows, function(question) {
					if(!$rootScope.sections[question.section]) {
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

					// Put responses here. Initialize with blank response
					$rootScope.responses[question.questionid] = {
						questionid: question.questionid,
						response: '',
					};

					// Put notes here.
					$rootScope.notes[question.questionid] = [];
					
					// Update progress bar as responses are given
					$rootScope.$watchCollection('responses["' + question.questionid + '"]', function(newValue) {
						$rootScope.$broadcast('response-updated', newValue);
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
						$rootScope.error = "Couldn't find control sheet";
						return;
					}

					if(!sheets['Answers']) {
						$rootScope.error = "Couldn't find answers sheet";
						return;
					}

					// Get any answer metadata from control sheet
					gs.getRows(answerKey, sheets['Control'], $rootScope.accessToken).then(function(config) {
						if(config.length == 0) {
							$rootScope.error = "Couldn't determine country!";
						}

						$rootScope.country = config[0].country;
					});

					answerSheet = sheets['Answers'];

					// Populate answers. This can be done in parralel with control data load
					// since the data sets are distinct
					gs.getRows(answerKey, sheets['Answers'], $rootScope.accessToken).then(function(answers) {
						angular.forEach(answers, function(answer) {
							if(!$rootScope.questions[answer.questionid]) {
								console.log("Answer with qid=" + answer.questionid + " does not correspond to any survey question");
								return;
							}

							$rootScope.responseLinks[answer.questionid] = answer[':links'];

							var response = $rootScope.responses[answer.questionid]; 

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
							$rootScope.$watch("responses['" + qid + "']", function(oldValue, newValue) {
								if(oldValue !== newValue) {
									queue[qid] = newValue;
								}
							}, true);
						});

						deferred.resolve();
					});

					// Populate notes for each question
					gs.getRows(answerKey, sheets['Notes'], $rootScope.accessToken).then(function(rows) {
						angular.forEach(rows, function(note) {
							if(!$rootScope.notes[note.questionid]) {
								console.log("Note with qid=" + note.questionid + " does not correspond to any survey question");
								return;
							}

							$rootScope.notes[note.questionid].push(note);	
						});
					});

				});
			}

			$rootScope.loading = "Loading Sections...";
			gs.getRows(masterKey, sheets['Sections'], $rootScope.accessToken).then(function(sections) {
				populateSections(sections);

				$rootScope.loading = "Loading Questions...";
				gs.getRows(masterKey, sheets['Questions'], $rootScope.accessToken).then(function(questions) {
					populateQuestions(questions);

					if(answerKey) {
						$rootScope.loading = "Loading Answers...";
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
				$rootScope.show_signin = true;
				return;
			}

			if(!authResult.status.signed_in || $rootScope.accessToken) {
				return;
			}

			$rootScope.accessToken = authResult.access_token;
			$rootScope.show_signin = false;

			$rootScope.loading = "Loading Survey...";

			// Get sheets in master sheet,
			gs.getSheets(masterKey, $rootScope.accessToken).then(function(sheets) {
				// Check for required 'Sections' sheet
				if(!sheets['Sections']) {
					$rootScope.loading = false;
					$rootScope.error = "Could't find 'Sections' sheet!";
					return;
				}

				// Load the survey
				populate(sheets)['finally'](function() {
					$rootScope.loading = false;
					$rootScope.status = {
						message: "Loaded",
						clear: 3000,
					};

					$rootScope.loaded = true;

					$rootScope.$broadcast('sections-loaded');
				});
			});
		};

		$rootScope.status = {
			message: "Loading..."
		}

		$rootScope.loading = "Authenticating...";
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

	// Set sectionAnswers and sectionQuestions scope variables for a particular
	// section when a response is changed
	.directive('updateOnResponse', [ '$timeout', function($timeout) {
		return {
			link: function($scope, element, attrs) {
				$scope.$on('response-updated', function() {
					$scope.sectionAnswers = [];
					$scope.sectionQuestions = _.filter($scope.questions, function(q) { 
						if(q.section == $scope.section) {
							if($scope.responses[q.questionid].response != undefined && $scope.responses[q.questionid].response != '') {
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

	// Fade out an element based on 'clear' property of argument 
	.directive('fadeOn', [ '$timeout', function($timeout) {
		return {
			link: function($scope, element, attrs) {
				var timeoutPromise;

				$scope.$watch(attrs.fadeOn, function(val) {
					$timeout.cancel(timeoutPromise);

					if(!val) {
						return;
					}

					if(val.clear) {
						timeoutPromise = $timeout(function() {
							element.fadeOut(function() {
								element.addClass('ng-hide');
								element.css('display', '');
							});
						}, val.clear, 0)
					}
				}, true);
			}
		}
	} ])

	// Attach notes to a question. Evaluate argument then evaluate against $scope
	.directive('notes', [ '$rootScope', function($rootScope) {
		return {
			templateUrl: 'tpl/notes.html',
			transclude: true,
			restrict: 'E',
			scope: {},

			link: function($scope, element, attrs) {
				// Determine the expression within 'response' that refers to the field being noted
				$scope.field = $scope.$eval(attrs.field);

				// Import scope variables
				$scope.question = $scope.$parent.question;
				$scope.notes = _.filter( $rootScope.notes[$scope.question.questionid], function(note) { return note.field == $scope.field; });

				$scope.addNote = function() {
					$rootScope.notes[$scope.question.questionid].push({
						questionid: $scope.question.questionid,
						field: $scope.field,
						note: $scope.newNote
					});

					$scope.newNote = '';
					$scope.notes = _.filter( $rootScope.notes[$scope.question.questionid], function(note) { return note.field == $scope.field; });
				}

				element.addClass('notable');

				$rootScope.$broadcast('close-notes');

				// Close notes when user clicks outside notes... TODO: Optimize. 
				// This Takes a long time for all notes boxes to receive this broadcast.
				$scope.$on('close-notes', function() {
					$scope.openNotes = false;
				});
			}
		}
	} ])

	.run([ '$rootScope', function($rootScope) {
		$(document).on('click', function(ev) {
			if($(ev.target).closest('.notes, .open-notes').length == 0) {
				$rootScope.$broadcast('close-notes');
			}
		});
	} ])

	// Drive a "sum" type question, which has for a value the sum of all
	// of its subquestion's responses
	.directive('sumQuestion', [ '$rootScope', function($rootScope) {
		return {
			link: function($scope, element, attrs) {
				var question = $scope.$eval(attrs.sumQuestion);
				
				// Update response when any child value changes
				var update = function() {
					function computeSum(questions) {
						var sum = 0;

						angular.forEach(questions, function(q) {
							var number = parseInt($scope.responses[q.questionid].response);

							if(!isNaN(number)) {
								sum += number;
							}

							if(q.subquestions && q.subquestions.length) {
								sum += computeSum(q.subquestions);
							}
						});

						return sum;
					}

					$rootScope.responses[question.questionid].response = computeSum(question.subquestions);
				}

				// Listen on all sub-question responses (and their subquestions)
				var listenRecursively = function(questions) {
					angular.forEach(questions, function(question) {
						$scope.$watch('responses["' + question.questionid + '"].response', update);
					});
				}

				listenRecursively(question.subquestions);
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
