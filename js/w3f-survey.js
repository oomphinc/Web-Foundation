var masterKey = '0Ahzzu_PDvOngdEJsZzRHVXJVMi13NU9TN2lTbjVQbmc';
var accessToken;

// Gimme a range op!
Array.prototype.range = function(n) {
	return Array.apply(null, Array(n)).map(function (_, i) {return i;});
}

angular.module('GoogleSpreadsheets', [])
	.factory('spreadsheets', [ '$http', '$q', function($http, $q) {
		var service = this;

		var getText = function(entry, field) {
			var elements = entry.getElementsByTagName(field);
			
			if(elements.length > 0) {
				return elements[0].textContent;
			}
			else {
				return null;
			}
		};

		function getSheets(key) {
			var url = 'https://spreadsheets.google.com/feeds/worksheets/' + key + '/private/full?access_token=' + accessToken;

			var deferred = $q.defer();

			console.log(url);
			$http({ url: url })
				.success(function(data, status, headers, config) {
					var xml = new DOMParser().parseFromString(data, "text/xml")
					var sheets = {};

					angular.forEach(xml.getElementsByTagName('entry'), function(entry) {
						var title = getText(entry, 'title');
						var id = getText(entry, 'id');
						
						if(typeof id == 'string') {
							id = id.match(/([^\/]+)$/)[1];
						}

						sheets[title] = {
							id: id,
							rowCount: parseInt(getText(entry, 'rowCount')),
							colCount: parseInt(getText(entry, 'colCount'))
						}
					});

					deferred.resolve(sheets);
				})
				.error(function(data, status, headers, config) {
					deferred.reject(data);
				});

			return deferred.promise;
		};

		function getRows(key, sheet, useKey) {
			var url = 'https://spreadsheets.google.com/feeds/list/' + key + '/' + sheet.id + '/private/full?access_token=' + accessToken;

			var deferred = $q.defer();

			console.log(url);
			$http({ url: url })
				.success(function(data, status, headers, config) {
					var xml = new DOMParser().parseFromString(data, "text/xml")
					var entries = xml.getElementsByTagName('entry');
					var rows = useKey ? {} : [];

					angular.forEach(entries, function(entry) {
						var cells = entry.getElementsByTagNameNS('http://schemas.google.com/spreadsheets/2006/extended', '*');
						var key;
						var row = {};
					
						angular.forEach(cells, function(cell) {
							var col = cell.tagName.match(/^gsx:(.+)$/)[1];

							if(useKey && col == useKey) {
								key = cell.textContent;
							}

							row[col] = cell.textContent;
						});

						if(key) {
							rows[key] = row;
						}
						else {
							rows.push(row);
						}
					});

					deferred.resolve(rows);
				})
				.error(function(data, status, headers, config) {
					deferred.reject(data);
				});

			return deferred.promise;
		};

		return {
			getSheets: getSheets,
			getRows: getRows
		};
	} ]);

angular.module('W3FSurvey', [ 'GoogleSpreadsheets' ])
	.controller('W3FSurveyController', [ 'spreadsheets', '$scope', '$q', function(gs, $scope, $q) {
		var controller = this;

		this.sectionOrder = [];
		this.sections = {};

		this.questions = {};
		this.loaded = false;

		// Questions by Section ID
		this.questions = {};

		this.navigate = function() {
			alert(arguments[0]);
		}

		$scope.sum = function(questions) {
			var sum = 0;

			angular.forEach(questions, function(question) {
				var number = parseInt(question.response.response);

				if(!isNaN(number)) {
					sum += number;
				}
			});

			return sum;
		};

		this.populate = function(sheets) {
			var deferred = $q.defer();

			// Populate "Sections" from sections sheet
			var populateSections = function(rows) {
				angular.forEach(rows, function(row) {
					controller.sectionOrder.push(row.section);
					if(!controller.panel) {
						controller.panel = row.section;
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

					if(row.guidance) {
						row.guidance = row.guidance.split(/\n+/);
					}

					// Responses go here, each question can have multiple response types
					// (TODO: Load from local data store, update answer sheet with any diffs, load comments on answer sheet)
					row.response = {};

					// YesNo can have multiple supporting statements information per answer
					if(row.type == 'YesNo') {
						row.supporting = [];

						// Pull up to 10 statements 
						for(var i = 0; i < 10; i++) {
							var id = 'supporting' + i;

							if(row[id]) {
								var matches = row[id].match(/(Yes|No|YesNo): (.+)/i);

								if(matches) {
									row.supporting.push({
										id: id,
										type: matches[1],
										question: matches[2]
									});
								}
							}
						}
					}

					// Row up to 10 options into an options array
					row.options = [];
					row.subquestions = [];

					for(var i = 0; i < 10; i++) {
						if(row['option' + i]) {
							row.options.push({ weight: i, value: row['option' + i] });
						}
					}

					questionsById[row.questionid] = row;

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

			gs.getRows(masterKey, sheets['Sections']).then(function(sections) {
				populateSections(sections);

				gs.getRows(masterKey, sheets['Questions']).then(function(questions) {
					populateQuestions(questions);
					deferred.resolve();
				});
			});

			return deferred.promise;
		};

		this.bootstrap = function() {
			gs.getSheets(masterKey).then(function(sheets) {
				if(!sheets['Sections']) {
					$scope.error = "Could't find 'Sections' sheet!";
				}

				controller.populate(sheets)['finally'](function() {
					$scope.loaded = true;
				});

			});
		}
		this.bootstrap();


	} ]);

function init() {
	var config = {
		'client_id': '830533464714-j7aafbpjac8cfgmutg83gu2tqgr0n5mm.apps.googleusercontent.com',
		'scope': 'https://spreadsheets.google.com/feeds'
	};

	var matches = document.cookie.match(/\bgs-access-token=([^;]+)/);
	var bootstrap = function() {
		angular.element(document).ready(function() {
			angular.bootstrap(document, ['W3FSurvey']);
		});
	}

	if(matches && matches[1]) {
		accessToken = matches[1];

		bootstrap();
	}
	else {
		gapi.auth.authorize(config, function() {
			var token = gapi.auth.getToken();
			
			accessToken = token.access_token;

			document.cookie = 'gs-access-token=' + accessToken;

			bootstrap();
		});	
	}
}
