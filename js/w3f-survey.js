var MASTER_KEY = '0ApqzJROt-jZ0dGNoZFFtMnB3dVctNWxyc295dENFWHc';
var CLIENT_ID = '830533464714-j7aafbpjac8cfgmutg83gu2tqgr0n5mm.apps.googleusercontent.com';
var SCOPE = 'https://spreadsheets.google.com/feeds https://www.googleapis.com/auth/userinfo.email';

// Gimme a range op!
Array.prototype.range = function(n) {
	return Array.apply(null, Array(n)).map(function (_, i) {return i;});
}

// How do we format dates?
Date.prototype.format = function() {
	return this.toDateString() + ", " + this.toLocaleTimeString();
}

angular.module('W3FWIS', [ 'GoogleSpreadsheets', 'W3FSurveyLoader', 'ngCookies', 'ngRoute', 'ngSanitize' ])
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
	.controller('W3FSurveyController', [ 'loader', 'spreadsheets', '$scope', '$rootScope', '$q', '$cookies', '$routeParams', '$interval', function(loader, gs, $scope, $rootScope, $q, $cookies, $routeParams, $interval) {
		var answerKey = $routeParams.answerKey;

		// Who's doing the Survey? Determined by answer sheet, defaults to "Anonymous"
		$rootScope.participant = 'Anonymous';

		// Section order and descriptors
		$rootScope.sectionOrder = [];
		$rootScope.sections = {};

		// Questions by Section ID
		$rootScope.questions = {};

		// Responses by question ID, as a watched scope model
		$rootScope.responses = {};

		// We're loading... !
		$rootScope.loading = false;
		$rootScope.loaded = true;

		// Notes by Question ID
		$rootScope.notes = {};

		// (Unresolved) note counts by section ID
		$rootScope.noteCount = {};

		// Anonymous until proven otherwise
		$rootScope.anonymous = true;

		// Control sheet values
		$rootScope.control = {};

		// Links to answer sheet rows by question id
		$rootScope.links = {
			responses: {},
			notes: {},
			control: {}
		};

		// Set up an initial page
		$rootScope.activeSection = $cookies.section;

		// Navigate to a different section
		$rootScope.navigate = function(section) {
			$rootScope.activeSection = $cookies.section = section;
			window.scrollTo(0,0);
		}
		
		// Count unresolved notes in a particular section, or if coordinator,
		// count ALL unresolved notes
		$rootScope.countNotes = function(sectionid) {
			var count = 0;

			// Falsey parameter, just count all unresolved notes
			if(!sectionid) {
				_.each($rootScope.notes, function(notes, questionid) {
					_.each(notes, function(note) {
						if(!note.resolved && ($rootScope.participant == 'Coordinator' || note.party != $rootScope.participant)) {
							count++;
						}
					});
				});
			}

			// Truthy parameter is a sectionid, count notes in that sectoin
			else {
				_.each($rootScope.sections[sectionid].questions, function(question) {
					_.each($rootScope.notes[question.questionid], function(note) {
						if(!note.resolved && ($rootScope.participant == 'Coordinator' || note.party != $rootScope.participant)) {
							count++;
						}
					});
				});

				$rootScope.noteCount[sectionid] = count;
			}

			return count;
		}

		// Potential status flow
		$rootScope.statusFlow = {
			'recruitment': {
				party: '',
				nextStates: [ 'assigned' ],
				label: "Recruitment"
			},
			'assigned': {
				party: 'Researcher',
				nextStates: [ 'spotcheck' ],
				label: "Research",
			},
			'spotcheck': {
				party: 'Coordinator',
				nextStates: [ 'clarification', 'review' ],
				label: "Spot-Check",
			},
			'clarification': {
				party: 'Researcher',
				nextStates: [ 'spotcheck' ],
				label: "Clarification"
			},
			'review': {
				party: 'Reviewer',
				nextStates: [ 'spotcheck', 'validation' ],
				label: "Review"
			},
			'validation': {
				party: 'Coordinator',
				nextStates: [ 'review', 'clarification', 'complete' ],
				label: "Validation",
			},
			'complete': {
				party: '',
				nextStates: [],
				label: "Completion"
			}
		};

		// Save queue
		var queue = {
			responses: {},
			notes: {}
		};
		
		// Load the survey once we're ready.
		$rootScope.$on('load-survey', function() {
			loader.load(answerKey).then(function(status) {
				$rootScope.status = status;
				$rootScope.loaded = true;
				$rootScope.loading = false;

				$rootScope.$broadcast('loaded');

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
							queue.responses[qid] = newValue;
						}
					}, true);

					// Also watch for changes in notes collections
					$rootScope.$watch("notes['" + qid + "']", function(oldValue, newValue) {
						if(oldValue !== newValue) {
							queue.notes[qid] = newValue;
							var sectionid = $rootScope.questions[qid].sectionid;

							$rootScope.countNotes(sectionid);
						}
					}, true);
				});
			}, function(message) {
				$rootScope.error = message;
				$rootScope.loading = false;
				$rootScope.readOnly = false;
			});

		})

		/**
		 * Accept a boolean or a string,
		 *
		 * If boolean, toggle "Complete" popup
		 * If string, complete the survey by moving it to the state specified, and
		 * make the survey readOnly.
		 */
		$rootScope.complete = function(completing) {
			if(typeof completing == "boolean") {
				$rootScope.completing = completing;
			}
			else if(typeof completing == "string" && $rootScope.completing) {
				var status = $rootScope.control['Status'];

				if(!$rootScope.statusFlow[status]) {
					$rootScope.status = {
						message: "The survey is an invalid state and can not be submitted. Please contact your survey coordinator to remedy this.",
						error: true,
						clear: 10000
					};

					$rootScope.completing = false;
					return;
				}

				$rootScope.status = {
					message: "Submitting survey for the next step..."
				};

				var state = $rootScope.statusFlow[status];

				gs.updateRow($rootScope.links.control['Status'].edit, {
					field: 'Status',
					value: completing
				}, $rootScope.accessToken)
					.then(function() {
						$rootScope.status = {
							message: "Submitted. Please return again!",
							readOnly: "This survey is now read-only. Please return again.", 
							success: true
						}
					});

				$rootScope.readOnly = true;
				$rootScope.completing = false;
				$rootScope.surveyStatus = completing;
			}
		}

		$rootScope.$watch('surveyStatus', function(status, oldStatus) {
			if(status === oldStatus) {
				return;
			}

			var state = $rootScope.statusFlow[status];

			if(!state) {
				$rootScope.status = {
					message: "Invalid status: `" + $rootScope.surveyStatus + "`. Please contact the Survey Coordinator to resolve this issue.",
					error: true
				}

				return;
			}
		});

		//
		// Manage updating the answer sheet 
		// 

		// Keep timers for processes here, cancelling pending changes to an update process
		// when newer changes have occured
		var processQueue = {
			responses: {},
			notes: {}
		};

		// Three-second timer
		$interval(function() {
			var size = 0;

			// Process a queue for the two sections
			_.each([ 'responses', 'notes' ], function(section) {
				if($rootScope.readOnly || $rootScope.anonymous) {
					return;
				}

				// Don't save question responses made by non-researchers
				if(section == 'responses' && $rootScope.participant == 'Reviewer') {
					return;
				}

				_.each(queue[section], function(response, qid) {
					var q = queue[section];
					var pq = processQueue[section];

					var links = $rootScope.links[section];
					var values = $rootScope[section][qid];

					if(pq[qid]) {
						_.each(pq[qid], function(q) { q.abort(); });
					}

					pq[qid] = [];

					if(section == 'responses') {
						// Build the record
						var record = $.extend({}, {
							response: values.response,
							justification: values.justification,
							confidence: values.confidence,
							privatenotes: values.privateNotes
						}, {
							questionid: qid
						});

						// Copy over any supporting information
						for(var i = 0; i < 10; i++) {
							if(values['supporting' + i]) {
								record['supporting' + i] = values['supporting' + i];
							}
						}

						// Munge examples from model structure
						_.each(values.example, function(example, i) {
							var ex = _.extend({}, {
								url: '',
								text: ''
							}, example);

							if(ex.url && ex.title) {
								// Store uploaded links as markdown-style
								record['example' + i] = '[' + ex.title.replace(']', '\]') + '](' + ex.url + ')';
							}
							else if(ex.url) {
								record['example' + i] = ex.url;
							}
							else if(ex.title) {
								record['example' + i] = ex.title;
							}
						});

						if(links[qid]) {
							pq[qid] = [ gs.updateRow(links[qid].edit, record, $rootScope.accessToken) ];
						}
						else {
							pq[qid] = [ gs.insertRow(answerSheets.Answers, record, $rootScope.accessToken) ];
						}
					}
					else if(section == 'notes') {
						// Add created notes
						_.each(_.filter(values, function(v) { return v.create; }), function(note) {
							var record = {
								questionid: note.questionid,
								date: new Date().format(),
								party: $rootScope.participant,
								field: note.field,
								note: note.note
							};

							var promise = gs.insertRow(answerSheets.Notes, record, $rootScope.accessToken);

							promise.then(function(row) { delete note.create; return row; });

							pq[qid].push(promise);
						});

						// Update edited notes
						_.each(_.filter(values, function(v) { return v.saveEdited || v.saveResolved; }), function(note) {
							var record = {
								questionid: note.questionid,
								date: note.date,
								party: $rootScope.participant,
								field: note.field,
								note: note.note,
								edited: note.edited,
								resolved: note.resolved
							};

							if(note.saveEdited) {
								record.edited = new Date().format();
							}
							else if(note.saveResolved) {
								record.resolved = new Date().format();
							}

							var promise = gs.updateRow(note[':links'].edit, record, $rootScope.accessToken);

							promise.then(function(row) {
								delete note.saveEdited; 
								delete note.saveResolved; 
								return row; 
							});

							pq[qid].push(promise);
						});
					}
					
					// TODO: Test Delete notes
					_.each(_.filter(values, function(v) { return v.deleted; }), function(note) {
						gs.deleteRow(note[':links'].edit, $rootScope.accessToken).then(function() {
							$rootScope.notes[qid] = _.filter($rootScope.notes[qid], function(v) {
								return !v.deleted;
							});
						});
					});

					_.each(pq[qid], function(ppq) {
						size++;
						ppq.then(function(row) {
							links[qid] = row[':links'];

							size--;

							if(size == 0) {
								$rootScope.status = {
									message: "Last saved " + new Date().format(),
									success: true,
									clear: 3000
								};
							}
						}, function(message) {
							$rootScope.status = {
								error: true,
								message: "Failed to save changes" 
							};
						});
					});
				});

				queue[section] = {};
			});

			if(size) {
				$rootScope.status = {
					saving: size
				}
			}
		}, 3000);
	} ])

	// Create a rail exactly the size of the sections menu
	.directive('withRail', [ '$timeout', function($timeout) {
		return {
			link: function($scope, element, attrs) {
				$scope.$on('loaded', function() {
					$timeout(function() {
						var $sections = $('#sections');
						var $ul = $sections.find('ul');

						$sections.width($ul.width());

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
						if(q.sectionid == $scope.sectionid) {
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

				if(!$scope.$eval(attrs.fadeOn)) {
					element.addClass('ng-hide');
				}

				$scope.$watch(attrs.fadeOn, function(val) {
					if(val) {
						element.removeClass('ng-hide');
					}

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
			restrict: 'E',
			scope: {},

			link: function($scope, element, attrs) {
				// Determine the expression within 'response' that refers to the field being noted
				$scope.field = $scope.$eval(attrs.field);

				$rootScope.$watch('participant', function(value) {
					$scope.participant = value;
				});

				// Import scope variables
				$scope.question = $scope.$parent.question;

				var refreshNotes = function() {
					$scope.notes = _.filter( $rootScope.notes[$scope.question.questionid], function(note) { return note.field == $scope.field; });
					$scope.count = _.reduce($scope.notes, function(memo, note) {
						return memo + (!note.resolved ? 1 : 0);
					}, 0);
				}

				refreshNotes();

				$rootScope.$watch('notes["' + $scope.question.questionid + '"]', refreshNotes, true);
				
				$scope.addNote = function() {
					if(!$scope.newNote || $scope.newNote.match(/^\s*$/)) {
						return;
					}

					$rootScope.notes[$scope.question.questionid].push({
						questionid: $scope.question.questionid,
						party: $rootScope.participant,
						field: $scope.field,
						note: $scope.newNote,
						create: true
					});

					$scope.addingNote = false;
					$scope.newNote = '';
				}

				$scope.$watch('addingNote', function(addingNote) {
					if($scope.editing) {
						$scope.editing.editing = false;
						$scope.editing = false;
					}

					if(addingNote) {
						element.find('textarea').focus();
					}
				});

				$scope.edit = function(index) {
					if($scope.editing) {
						$scope.editing.editing = false;
					}

					$scope.editing = $scope.notes[index];

					$scope.notes[index].editValue = $scope.notes[index].note;
					$scope.notes[index].editing = true;
				}

				$scope.$watch('editing', function(editing) {
					if(editing) {
						$scope.addingNote = false;
					}
				});

				$scope.resolve = function(index) {
					$scope.notes[index].saveResolved = true;
				}

				$scope.delete = function(index) {
					$scope.notes.splice(index,1)[0].deleted = true;
				}

				element.addClass('notable');

				$scope.$watch('opened', function(opened) {
					$(document).trigger('close-notes');

					if(opened) {
						function cancel() {
							$scope.opened = false;
							$(document).off('close-notes', cancel);
						}
						$(document).on('close-notes', cancel);
					}
				});
			}
		}
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

	// A field for specifying a URL or a uploaded file
	.directive('uploadableUrl', [ '$rootScope', function($rootScope) {
		return {
			templateUrl: 'tpl/uploadable-url.html',
			restrict: 'E',
			replace: true,
			scope: {
				model: '='
			},

			link: function($scope, element, attrs) {
				$scope.placeholder = attrs.placeholder ? $scope.$eval(attrs.placeholder) : '';
				$scope.$watch(attrs.placeholder, function(oldValue, newValue) {
					if(oldValue !== newValue) {
						$scope.placeholder = $scope.$eval(attrs.placeholder);
					}
				});

				$scope.$parent.$watch(attrs.ngDisabled, function(val) {
					$scope.disabled = val;
				});

				$scope.upload = function(upload) {
					var $scope = $(upload).scope();

					if($scope.uploading) {
						return;
					}

					var $index = $(upload).parents('.flexible-list-item').index();

					var file = upload.files[0];

					if(!file) {
						console.log("File not found to upload!");
						return
					}

					const boundary = '-------314159265358979323846';
					const delimiter = "\r\n--" + boundary + "\r\n";
					const close_delim = "\r\n--" + boundary + "--";

					var reader = new FileReader();
					reader.readAsBinaryString(file);
					reader.onload = function(e) {
						var contentType = file.type || 'application/octet-stream';
						var metadata = {
							'title': file.name,
							'mimeType': contentType
						};

						var base64Data = btoa(reader.result);
						var multipartRequestBody =
								delimiter +
								'Content-Type: application/json\r\n\r\n' +
								JSON.stringify(metadata) +
								delimiter +
								'Content-Type: ' + contentType + '\r\n' +
								'Content-Transfer-Encoding: base64\r\n' +
								'\r\n' +
								base64Data +
								close_delim;

						var request = gapi.client.request({
								'path': '/upload/drive/v2/files',
								'method': 'POST',
								'params': {'uploadType': 'multipart'},
								'headers': {
									'Content-Type': 'multipart/mixed; boundary="' + boundary + '"'
								},
								'body': multipartRequestBody
						});

						$scope.uploadState = "Uploading...";
						$scope.uploading = true;

						request.execute(function(results, status) {
							status = JSON.parse(status);
							status = status.gapiRequest.data;

							$scope.uploading = false;

							if(status.status == 200) {
								$scope.uploadState = "Uploaded";
								$scope.model.locked = true;
								$scope.model.url = results.alternateLink;
								$scope.model.title  = results.title;
							}
							else {
								$scope.uploadState = "Upload Failed! Try again.";
								$scope.model.locked = false;
							}
						});
					}
				}
			}
		}
	} ])

	// Allow for insert/update/delete operations on a list of text inputs
	.directive('flexibleList', [ '$rootScope', function($rootScope) {
		return {
			templateUrl: 'tpl/flexible-list.html',
			restrict: 'E',
			scope: {},

			link: function($scope, element, attrs) {
				$scope.atLeast = parseInt(attrs.atLeast);

				var load = function(newValue) {
					$scope.list = newValue;

					if(!$scope.list) {
						$scope.list = [];
					}

					if($scope.atLeast && $scope.list && $scope.list.length < $scope.atLeast) {
						for(var i = 0; i < $scope.atLeast; i++) {
							$scope.list.push({});
						}
					}
				}

				$scope.$parent.$watch(attrs.collection, load, true);

				$scope.$watch('list', function(newValue) {
					$scope.$parent.collection = newValue;
				});

				$scope.$parent.$watch(attrs.ngDisabled, function(disabled) {
					$scope.disabled = disabled;
				});

				$scope.add = function() {
					$scope.list.push({});
				}
			}
		}
	} ])

	// Fancy select box
	.directive('fancySelect', [ '$rootScope', '$timeout', function($rootScope, $timeout) {
		return {
			restrict: 'E',
			templateUrl: 'tpl/fancy-dropdown.html',
			replace: true,
			compile: function(element, attrs) {
				var $select = element.find('select');
				var selectedIndex = -1;

				_.each(_.clone(element[0].attributes), function(attr) {
					if(attr.name != 'class') {
						$select.attr(attr.name, attr.value);
						element.removeAttr(attr.name);
					}
				});

				if(attrs.withNull) {
					$select.append($('<option value="">').text(attrs.withNull));
					selectedIndex = 0;
				}

				var disabled = attrs.ngDisabled;
					
				return function($scope, element, attrs, transclude) {
					var $select = element.find('select');
					var $options = element.find('.fancy-select-options');

					$rootScope.$watch(disabled, function(val) {
						$scope.disabled = val;
					});
					$scope.selectedIndex = selectedIndex;

					// Keep a local model containing the select's <option>s
					//
					// The angular code for managing the select <option>s is turbly
					// complicated and it's best to just avoid having to use it at all,
					// use the DOM to notify of changes instead
					function update() {
						$scope.items = [];

						$select.find('option').each(function() {
							$scope.items.push(this.textContent);
						});

						// Measure the width of the widest item and set the drop-down's
						// width to that
						$timeout(function() {
							var $clone = $('<div class="fancy-select">');

							$clone.html(element.html());
							$clone.css('width', '');

							var	$dropdown = $clone.find('.fancy-select-options');

							$clone.css({ visibility: 'hidden', position: 'absolute', top: 0 });
							$dropdown.removeClass('ng-hide').css('display', 'block');
							$('body').append($clone);
							element.css({ width: $dropdown.outerWidth() });
							$clone.remove();
						}, 0);

						$scope.selectedIndex = $select[0].selectedIndex;
					}

					var lastOptions = [];

					$scope.$parent.$watch(function() {
						var options = _.map($select[0].options, function(option) {
							return [ option.value, option.textContent ];
						});

						if(!_.isEqual(options, lastOptions) || $select[0].selectedIndex != $scope.selectedIndex) {
							update();
							lastOptions = options;
						}
					});

					update();

					// Use the DOM to notify angular by just changing the value
					$scope.select = function(index) {
						$timeout(function() {
							$select[0].selectedIndex = index;
							$select.trigger('change');
						}, 0);

						$scope.opened = false;
						$scope.selectedIndex = index;
					}

					$scope.$on('close-popups', function() {
						if($scope.opened) {
							$scope.opened = false;
						}
					});
				}
			}
		}
	} ])

	// Modal controlled by a model variable
	.directive('modal', [ '$rootScope', '$timeout', function($rootScope, $timeout) {
		return {
			restrict: 'E',
			templateUrl: 'tpl/modal.html',
			transclude: true,
			replace: true,
			link: function($scope, element, attrs) {
				$scope.$watch(attrs.model, function(val) {
					$scope.showing = val;
				});

				if(attrs.cancel) {
					$scope.cancel = function() {
						$scope.$eval(attrs.cancel);
					}
				}
			}
		}
	} ])

	// Initialize this module
	.run([ '$rootScope', '$q', 'spreadsheets', function($rootScope, $q, gs) {
		$rootScope.readOnly = true;
		$rootScope.loading = true;

		// Broadcast to all scopes when popups or notes should be closed
		// because we clicked on the document
		$(document).on('click', function(ev) {
			if($(ev.target).closest('.notes, .open-notes, .cancel-note, .save-note, .note-edit, .note-resolve').length == 0) {
				$(document).trigger('close-notes');
			}
			if($(ev.target).closest('.fancy-select').length == 0) {
				$rootScope.$broadcast('close-popups');
			}
		});

		function authenticated(authResult) {
			if(!authResult || authResult.error) {
				$rootScope.showSignin = true;
				return;
			}

			if(!authResult.status.signed_in || $rootScope.accessToken) {
				$rootScope.loading = false;
				return;
			}

			var loadSurvey = function() {
				$rootScope.accessToken = authResult.access_token;
				$rootScope.showSignin = false;

				$rootScope.loading = "Loading Survey...";

				$rootScope.status = {
					message: "Loading..."
				};

				$rootScope.$broadcast('load-survey');
			}

			// Get the user's email address, then continue loading
			gapi.client.load('oauth2', 'v2', function() {
				gapi.client.oauth2.userinfo.get().execute(function(resp) {
					$rootScope.userEmail = resp.email;

					loadSurvey();
				});
			});
		};

		window.gapi_loaded = function() {
			$rootScope.loading = "Authenticating...";

			gapi.auth.authorize({
				client_id: CLIENT_ID,
				scope: SCOPE,
				immediate: true
			}, authenticated);
		}
		
		// Render the sign-in button
		gapi.signin.render(document.getElementById('signin-button'), {
			clientid: CLIENT_ID,
			scope: SCOPE,
			cookiepolicy: 'single_host_origin',
			callback: authenticated
		});

	} ]);
