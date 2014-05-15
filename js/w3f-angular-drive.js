/**
 * W3F Web Index Survey - Angular interface to Google Drive
 *
 * Copyright (C) 2014  Ben Doherty, Jason LeVan @ Oomph, Inc.
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
angular.module('GoogleDrive', [])
	.factory('gdrive', [ '$http', '$q', function($http, $q) {
		var service = this;

		// Introduce an "abort" method on promise objects which will
		// kill the current request
		var defer = function() {
			var deferred = $q.defer();

			deferred.promise.abort = function() {
				deferred.reject("cancelled");
			}

			return deferred;
		}

		function getPermissionIdByEmail(email) {
			var deferred = defer();

			var request = gapi.client.drive.permissions.getIdForEmail({
				'email': email,
			});

			request.execute(function(resp) {
				deferred.resolve(resp);
			});

			return deferred.promise;
		}

		function insertPermission(fileId, type, value, role) {
			var deferred = defer();

			if( !(fileId || type || value || role) ) {
				deferred.reject('missing parameter(s)');
			}

			var resource = {
				'type': type,
				'value': value,
				'role': role
			}

			var request = gapi.client.drive.permissions.insert({
				'fileId': fileId,
				'sendNotificationEmails': false,
				'resource': resource
			});

			request.execute(function(resp) {
				deferred.resolve(resp);
			});

			return deferred.promise;
		}

		return {
			getPermissionIdByEmail: getPermissionIdByEmail,
			insertPermission: insertPermission
		};
	} ]);
