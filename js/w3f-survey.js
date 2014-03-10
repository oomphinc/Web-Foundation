var CLIENT_ID = '830533464714-j7aafbpjac8cfgmutg83gu2tqgr0n5mm.apps.googleusercontent.com';
var SCOPE = 'https://spreadsheets.google.com/feeds';

// Gimme a range op!
Array.prototype.range = function(n) {
	return Array.apply(null, Array(n)).map(function (_, i) {return i;});
}

angular.module('W3FSurvey', [ 'GoogleSpreadsheets', 'ngCookies' ])
	.controller('W3FSurveyController', [ 'spreadsheets', '$scope', '$q', '$cookies', function(gs, $scope, $q, $cookies) {	
		var masterKey = '0Ahzzu_PDvOngdEJsZzRHVXJVMi13NU9TN2lTbjVQbmc';
		var accessToken = null;
		var controller = this;

		this.sectionOrder = [ 'Home' ];
		this.sections = {};

		this.questions = {};
		this.loaded = false;

		// Questions by Section ID
		this.questions = {};

		// Responses by question ID, as a watched scope model
		//
		// TODO: Load from Answer sheet
		$scope.responses = {};

		// Get callback to update a particular answer in the answer sheet
		var updateAnswer = function(qid) {
			return function(oldValue, newValue) { 
				// BUG: oldValue and newValue are the same in this call from $watchCollection -
				// See: https://github.com/angular/angular.js/issues/2621. 
				console.log(arguments);
			}
		}

		// Allow use of "Sum" function for summing sub-question response values (the numbers, anyway)
		$scope.sum = function(questions) {
			var sum = 0;

			angular.forEach(questions, function(question) {
				var number = parseInt($scope.responses[question.questionid].response);

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
		this.section = $cookies.section;

		if(!this.section) {
			this.section = $cookies.section = 'Home';
		}

		this.sections.Home = {
			title: "World Wide Web Foundation Open Data Barometer - 2014",
			description: "This is a survey."
		};

		// Navigate to a different section
		this.navigate = function(section) {
			controller.section = $cookies.section = section;
		}

		this.populate = function(sheets) {
			var deferred = $q.defer();

			// Populate "Sections" from sections sheet
			var populateSections = function(rows) {
				angular.forEach(rows, function(row) {
					controller.sectionOrder.push(row.section);

					// Default to first section
					if(!controller.section) {
						controller.section = row.section;
					}

					controller.sections[row.section] = row;
					controller.sections[row.section].questions = [];
				});
			};

			// Populate "Questions" from questions sheet
			var populateQuestions = function(rows) {
				// Track questions by ID to form parent relationships
				var questionsById = {};

				angular.forEach(rows, function(row) {
					if(!controller.sections[row.section]) {
						return;
					}

					// Responses go here, each question can have multiple response types
					// (TODO: Load from local data store, update answer sheet with any diffs, load comments on answer sheet)
					row.response = {};

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

					// Allow subquestions
					row.subquestions = [];

					// Keep a flat reference to questions by ID so we can build heirarchy as we go
					questionsById[row.questionid] = row;

					if(!$scope.responses[row.questionid]) {
						$scope.responses[row.questionid] = {};

						// Set up individual watches for each response so 
						$scope.$watchCollection("responses['" + row.questionid + "']", updateAnswer(row.questionid));
					}

					// Child questions, assume parent has already been registered
					if(row.parentid) {
						questionsById[row.parentid].subquestions.push(row);
					}
					// Top-level question
					else {
						controller.sections[row.section].questions.push(row);
					}
				});
			}

			gs.getRows(masterKey, sheets['Sections'], accessToken).then(function(sections) {
				populateSections(sections);

				gs.getRows(masterKey, sheets['Questions'], accessToken).then(function(questions) {
					populateQuestions(questions);
					deferred.resolve();
				});
			});

			return deferred.promise;
		};

		window.authenticated = function(authResult) {
			if(!authResult || !authResult.status.signed_in || accessToken) {
				return;
			}

			accessToken = authResult.access_token;

			// Load the survey from the Master sheet
			gs.getSheets(masterKey, accessToken).then(function(sheets) {
				if(!sheets['Sections']) {
					$scope.error = "Could't find 'Sections' sheet!";
					return;
				}

				controller.populate(sheets)['finally'](function() {
					$scope.loaded = true;
				});
			});
		};

		window.SURVEY_LOADED = true;
		window.bootstrap();
	} ]);

window.bootstrap = function() {
	if(!window.GAPI_LOADED || !window.SURVEY_LOADED) {
		return;
	}

	// Try to authenticate immediately
	gapi.auth.authorize({
		client_id: CLIENT_ID,
		scope: SCOPE,
		immediate: true
	}, window.authenticated);
}

window.gapi_loaded = function() {
	window.GAPI_LOADED = true;

	// Render the sign-in button
	gapi.signin.render(document.getElementById('signin-button'), {
		clientid: CLIENT_ID,
		scope: SCOPE,
		cookiepolicy: 'single_host_origin',
		callback: 'authenticated'
	});

	bootstrap();
};


