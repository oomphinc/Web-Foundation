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

		function getSheets(key, accessToken) {
			var url = 'https://spreadsheets.google.com/feeds/worksheets/' + key + '/private/full';

			if(accessToken) {
				url += '?access_token=' + accessToken;
			}

			var deferred = $q.defer();

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

		function getRows(key, sheet, accessToken, useKey) {
			var url = 'https://spreadsheets.google.com/feeds/list/' + key + '/' + sheet.id + '/private/full';

			if(accessToken) {
				url += '?access_token=' + accessToken;
			}

			var deferred = $q.defer();

			$http.get(url)
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


