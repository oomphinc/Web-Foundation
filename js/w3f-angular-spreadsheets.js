/**
 * W3F Web Index Survey - Angular interface to Google Spreadsheets
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

		// Introduce an "abort" method on promise objects which will
		// kill the current request
		var defer = function() {
			var deferred = $q.defer();

			deferred.promise.abort = function() {
				deferred.reject("cancelled");
			}

			return deferred;
		}

		// Process a single XML entry for a list feed and return a "row"
		var mungeEntry = function(entry) {
			var id = entry.getElementsByTagName('id');
			var cells = entry.getElementsByTagNameNS('http://schemas.google.com/spreadsheets/2006/extended', '*');
			var key;
			var row = {};

			angular.forEach(cells, function(cell) {
				var col = cell.tagName.match(/^gsx:(.+)$/)[1];

				row[col] = cell.textContent;
			});

			var links = entry.getElementsByTagName('link');

			// Prefix meta data with :, save links and row id
			row[':links'] = {};

			angular.forEach(links, function(link) {
				row[':links'][link.getAttribute('rel')] = link.getAttribute('href');
			});

			row[':id'] = id[0].textContent.match(/\/([^\/]+)$/)[1];

			return row;
		};

		function getSheets(key, accessToken) {
			var url = 'https://spreadsheets.google.com/feeds/worksheets/' + key + '/private/full';

			if(accessToken) {
				url += '?access_token=' + accessToken;
			}

			var deferred = defer();

			$http({ 
				url: url,
				timeoout: deferred
			})
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
					deferred.reject("Unable to access answer data.");
				});

			return deferred.promise;
		};

		function getRows(key, sheet, accessToken, useKey) {
			var url = 'https://spreadsheets.google.com/feeds/list/' + key + '/' + sheet.id + '/private/full';

			if(accessToken) {
				url += '?access_token=' + accessToken;
			}

			var deferred = defer();

			$http({
				method: 'GET',
				url: url,
				timeout: deferred
			})
				.success(function(data, status, headers, config) {
					var xml = new DOMParser().parseFromString(data, "text/xml")
					var entries = xml.getElementsByTagName('entry');
					var rows = useKey ? {} : [];

					angular.forEach(entries, function(entry) {
						var row = mungeEntry(entry);

						if(useKey) {
							if(key) {
								rows[row[useKey]] = row;
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
			var deferred = defer();
			var parseResponse = function(data) {
				var xml = new DOMParser().parseFromString(data, "text/xml");
				var entries = xml.getElementsByTagName('entry');

				return mungeEntry(entries[0]);
			}

			$http({
				method: 'POST',
				url: '/submit.php?accessToken=' + accessToken + '&url=' + url + '&method=PUT',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded'
				},
				timeout: deferred,
				data: $.param(values)
			})
				.success(function(data, status, headers, config) {
					deferred.resolve(parseResponse(data));
				})
				.error(function(data, status, headers, config) {
					// Don't necessarily call 409 status an error: maybe nothing was going to change
					// anyway
					if(status == 409) {
						deferred.resolve(parseResponse(data));
					}
					
					deferred.reject(data);
				});
			
			return deferred.promise;
		};

		function insertRow(sheet, values, accessToken) {
			var url = 'https://spreadsheets.google.com/feeds/list/' + sheet.key + '/' + sheet.id + '/private/full';
			var deferred = defer();

			$http({
				method: 'POST',
				url: '/submit.php?accessToken=' + accessToken + '&url=' + url + '&method=POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded'
				},
				timeout: deferred,
				data: $.param(values)
			})
				.success(function(data, status, headers, config) {
					var xml = new DOMParser().parseFromString(data, "text/xml")
					var entries = xml.getElementsByTagName('entry');

					deferred.resolve(mungeEntry(entries[0]));
				})
				.error(function(data, status, headers, config) {
					deferred.reject(data);
				});
			
			return deferred.promise;
		};

		function deleteRow(url, accessToken) {
			var deferred = defer();

			$http({
				method: 'GET',
				url: '/submit.php?accessToken=' + accessToken + '&url=' + url + '&method=DELETE',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded'
				},
				timeout: deferred,
			})
				.success(function(data, status, headers, config) {
					var xml = new DOMParser().parseFromString(data, "text/xml")
					var entries = xml.getElementsByTagName('entry');

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
			insertRow: insertRow,
			deleteRow: deleteRow
		};
	} ]);


