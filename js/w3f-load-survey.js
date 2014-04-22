/**
 * W3F Web Index Survey - Survey Data Loader 
 *
 * Copyright (C) 2014  Ben Doherty @ Oomph, Inc.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */
angular.module('W3FSurveyLoader', [ 'GoogleSpreadsheets' ])
	.factory('loader', [ 'spreadsheets', '$rootScope', '$q', function(gs, $rootScope, $q) {
		var answerKey;
		$rootScope.answerSheets = {
			'Control': null,
			'Answers': null,
			'Notes': null
		};

		// Load the answer control sheet
		var loadControl = function() {
			$rootScope.loading = "Loading Control...";

			var q = $q.defer();

			gs.getRows(answerKey, $rootScope.answerSheets.Control, $rootScope.accessToken, 'field').then(function(rows) {
				_.each(rows, function(row, key) {
					$rootScope.control[key] = row.value;
					$rootScope.links['control'][key] = row[':links'];
				});

				// Ensure all required fields are defined:
				var requiredFields = [ 'Coordinator Email', 'Researcher', 'Status' ]; 
				var missingFields = _.filter(requiredFields, function(field) {
					return typeof $rootScope.control[field] == 'undefined';
				});

				if(missingFields.length) {
					q.reject("Missing field " + missingFields.join(', '));
					return;
				}

				if($rootScope.userEmail) {
					// Who even are you?
					if($rootScope.userEmail == $rootScope.control['Coordinator Email']) {
						$rootScope.participant = 'Coordinator';
					}
					else if(hex_md5($rootScope.userEmail) == $rootScope.control['Researcher']) {
						$rootScope.participant = 'Researcher';
					}
					else if(hex_md5($rootScope.userEmail) == $rootScope.control['Reviewer']) {
						$rootScope.participant = 'Reviewer';
					}

					$rootScope.surveyStatus = $rootScope.control['Status'];

					var state = $rootScope.statusFlow[$rootScope.surveyStatus];

					if(state && (state.party == $rootScope.participant || $rootScope.participant == 'Coordinator')) {
						$rootScope.readOnly = false;
					}
				}

				$rootScope.anonymous = $rootScope.participant == 'Anonymous';
				$rootScope.country = $rootScope.control['Country'];

				if($rootScope.anonymous) {
					q.reject();
					return;
				}

				q.resolve();
			}, q.reject);

			return q.promise;
		}

		// Populate "Sections" from sections sheet
		var populateSections = function(rows) {
			angular.forEach(rows, function(section) {
				$rootScope.sectionOrder.push(section.sectionid);

				// Default to first section
				if(!$rootScope.activeSection) {
					$rootScope.activeSection = section.sectionid;
				}

				$rootScope.sections[section.sectionid] = section;
				$rootScope.sections[section.sectionid].questions = [];
			});
		};

		// Populate "Questions" from questions sheet
		var populateQuestions = function(rows) {
			angular.forEach(rows, function(question) {
				if(!$rootScope.sections[question.sectionid]) {
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

				question.qid = question.questionid.replace(/[^A-Za-z0-9]/g, '');

				// Child questions, assume parent has already been registered.
				if(question.parentid) {
					$rootScope.questions[question.parentid].subquestions.push(question);
				}
				// Top-level question in this section
				else {
					$rootScope.sections[question.sectionid].questions.push(question);
				}
			});
		}

		// Load Master sheet
		var loadMaster = function() {
			var q = $q.defer();

			gs.getSheets(MASTER_KEY, $rootScope.accessToken).then(function(sheets) {
				// Check for required 'Sections' sheet
				if(!sheets['Sections']) {
					$rootScope.loading = false;
					$rootScope.error = "Couldn't find 'Sections' sheet!";
					return;
				}

				// Load answer sheet and populate responses model
				$rootScope.loading = "Loading Sections...";
				gs.getRows(MASTER_KEY, sheets['Sections'], $rootScope.accessToken).then(function(sections) {
					populateSections(sections);

					$rootScope.loading = "Loading Questions...";

					gs.getRows(MASTER_KEY, sheets['Questions'], $rootScope.accessToken).then(function(questions) {
						populateQuestions(questions);

						loadAnswerData(q);
					}, q.reject);
				}, q.reject);
			});

			return q.promise;
		}
		
		// Load answer sheet once questions have been loaded
		var loadAnswerData = function(deferred) {
			var loadError = function(message) {
				return function(more) {
					deferred.reject({
						error: message + (more ? ': ' + more : ''),
						message: "There was an error loading the survey."
					});
				}
			}

			var loadAnswers = function() {
				$rootScope.loading = "Loading Answers...";

				var q = $q.defer();

				// Populate answers. This can be done in parralel with control data load
				// since the data sets are distinct
				gs.getRows(answerKey, $rootScope.answerSheets.Answers, $rootScope.accessToken).then(function(answers) {
					angular.forEach(answers, function(answer) {
						if(!$rootScope.questions[answer.questionid]) {
							console.log("Answer with qid=" + answer.questionid + " does not correspond to any survey question");
							return;
						}

						$rootScope.links.responses[answer.questionid] = answer[':links'];

						var response = $rootScope.responses[answer.questionid]; 

						// Copy all response properties from sheet into row
						for(var col in answer) {
							// Ignore metadata fields starting with :
							if(col[0] != ':') {
								response[col] = answer[col];
							}
						}

						// Parse examples
						angular.forEach([ 'example' ], function(field) {
							var collection = [];

							for(var i = 0; i <= 10; i++) {
								var id = field + i;

								if(typeof answer[id] == 'string' && answer[id] != '' ) {
									var matches = answer[id].match(/^\[(.+)\]\((.+)\)$/);

									var ex = {
										title: '',
										url: '',
										locked: true,
									};

									if(matches) {
										ex.title = matches[1];
										ex.url = matches[2];
									}
									else if(answer[id].match(/^https?:$/)) {
										ex.url = answer[id];
									}
									else {
										ex.title = answer[id];
									}

									collection.push(ex);
								}
							}

							response[field] = collection;
						});
					});

					q.resolve();
				}, q.reject);

				return q.promise;
			}

			var loadNotes = function() {
				$rootScope.loading = "Loading Notes...";

				var q = $q.defer();

				// Populate notes for each question
				return gs.getRows(answerKey, $rootScope.answerSheets.Notes, $rootScope.accessToken).then(function(rows) {
					_.each(rows, function(note) {
						if(!$rootScope.notes[note.questionid]) {
							console.log("Note with qid=" + note.questionid + " does not correspond to any survey question");
							return;
						}

						$rootScope.notes[note.questionid].push(note);	
					});

					_.each($rootScope.sectionOrder, function(sectionid) {
						$rootScope.countNotes(sectionid);
					});

					q.resolve();
				}, q.reject);

				return q.promise;
			}

			// Pull sheets from answer sheet and confirm they're all there.
			gs.getSheets(answerKey, $rootScope.accessToken).then(function(sheets) {
				for(var sheet in $rootScope.answerSheets) {
					if(!sheets[sheet]) {
						loadError("Invalid answer sheet.")();
						return;
					}
					else {
						$rootScope.answerSheets[sheet] = sheets[sheet];
					}
				}

				// We now have confirmed the answer spreadsheet has all of the required sheets,
				// load each one in sequence
				loadControl().then(function() {
					loadAnswers().then(function() {
						loadNotes().then(function() {
							if($rootScope.status.error) {
								deferred.resolve($rootScope.status);
							}
							else {
								deferred.resolve({
									message: "Loaded",
									success: true,
									clear: 3000,
								});
							}
						}, loadError("Invalid notes"));
					}, loadError("Invalid answers"));
				}, loadError("Invalid control"));
			}, loadError("Invalid answer key"));
		};

		function load() {
			var deferred = $q.defer();

			if(answerKey) {
				// Pull sheets from answer sheet and confirm they're all there.
				gs.getSheets(answerKey, $rootScope.accessToken).then(function(sheets) {
					for(var sheet in $rootScope.answerSheets) {
						if(!sheets[sheet]) {
							$rootScope.error = "Invalid response data";
							return;
						}
						else {
							$rootScope.answerSheets[sheet] = sheets[sheet];
						}
					}

					loadControl().then(function() {
						loadMaster().then(function(status) {
							deferred.resolve(status);
						}, function(status) {
							deferred.reject(status.message);
						})
					}, function() {
						deferred.reject("Unable to load response data.");
					});
				}, function() {
					deferred.reject("There was a problem loading the survey.");
				});

			}
			else {
				deferred.reject("Thanks for visiting the Web Index Survey. You are not currently participating in the survey.");
			}

			return deferred.promise;
		}

		return {
			load: function(_answerKey) {
				answerKey = _answerKey;

				return load();
			}
		};
	} ]);

