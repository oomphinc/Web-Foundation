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

						var sheet = {
							key: key,
							id: id,
							rowCount: parseInt(getText(entry, 'rowCount')),
							colCount: parseInt(getText(entry, 'colCount'))
						};
						
						var links = entry.getElementsByTagName('link');

						// Prefix meta data with :, save links and row id
						sheet[':links'] = {};

						angular.forEach(links, function(link) {
							sheet[':links'][link.getAttribute('rel')] = link.getAttribute('href');
						});

						sheets[title] = sheet;
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
						var id = entry.getElementsByTagName('id');
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

						var links = entry.getElementsByTagName('link');

						// Prefix meta data with :, save links and row id
						row[':links'] = {};

						angular.forEach(links, function(link) {
							row[':links'][link.getAttribute('rel')] = link.getAttribute('href');
						});

						row[':id'] = id[0].textContent.match(/\/([^\/]+)$/)[1];

						if(useKey) {
							if(key) {
								rows[key] = row;
							}
							else {
								if(!rows['']) {
									rows[''] = [];
								}

								rows[''].push(row);
							}
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

		function updateRow(url, values, accessToken) {
			var deferred = $q.defer();

			$http({
				method: 'POST',
				url: '/submit.php?accessToken=' + accessToken + '&url=' + url + '&method=PUT',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded'
				},
				data: $.param(values)
			})
				.success(function(data, status, headers, config) {
					deferred.resolve();
				})
				.error(function(data, status, headers, config) {
					deferred.reject(data);
				});
			
			return deferred.promise;
		};

		function insertRow(sheet, values, accessToken) {
			var url = 'https://spreadsheets.google.com/feeds/list/' + sheet.key + '/' + sheet.id + '/private/full';
			var deferred = $q.defer();

			$http({
				method: 'POST',
				url: '/submit.php?accessToken=' + accessToken + '&url=' + url + '&method=POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded'
				},
				data: $.param(values)
			})
				.success(function(data, status, headers, config) {
					deferred.resolve();
				})
				.error(function(data, status, headers, config) {
					deferred.reject(data);
				});
			
			return deferred.promise;
		};

		return {
			getSheets: getSheets,
			getRows: getRows,
			updateRow: updateRow,
			insertRow: insertRow
		};
	} ]);


