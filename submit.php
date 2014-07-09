<?php
/**
 * W3F Web Index Survey - Google Spreadsheets POST proxy
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

function fail( $message ) {
	header( '401 Bad Request' );
	header( 'Content-Type: text/plain' );

	echo $message;
}

// Basic sanity check required GET parameters, pull them into namespace
foreach( array( 'accessToken', 'url', 'method' ) as $param ) {
	if( !isset( $_GET[$param] ) || !is_string( $_GET[$param] ) || empty( $_GET[$param] ) ) {
		fail( "Missing $param" );
	}

	$$param = $_GET[$param];
}

// Further sanity checks
if( strpos( $url, 'https://spreadsheets.google.com/feeds/') !== 0 ) {
	fail( "Invalid URL" );
}

if( $method != 'POST' && $method != 'PUT' && $method != 'DELETE' ) {
	fail( "Invalid method" );
}

$ch = curl_init( $url );

$http_headers = array(
	'Authorization: Bearer ' . $accessToken,
	'Content-Type: application/atom+xml'
);

if( $method != 'DELETE' && count( $_POST ) > 0 ) {
	$payload = '<entry xmlns="http://www.w3.org/2005/Atom" xmlns:gsx="http://schemas.google.com/spreadsheets/2006/extended">';

	foreach( $_POST as $var => $val ) {
		$payload .= '<gsx:' . $var . '>' . htmlspecialchars( $val ) . '</gsx:' . $var . '>';
	}

	$payload .= '</entry>';

	$http_headers[] = 'Content-Length: ' . strlen( $payload );

	curl_setopt( $ch, CURLOPT_POSTFIELDS, $payload );
}


curl_setopt( $ch, CURLOPT_CUSTOMREQUEST, $method );
curl_setopt( $ch, CURLOPT_RETURNTRANSFER, true );
curl_setopt( $ch, CURLOPT_HEADER, true );
curl_setopt( $ch, CURLOPT_HTTPHEADER, $http_headers );

$result = curl_exec( $ch );

if( !$result ) {
	http_response_code( 503 );
	exit( 0 );
}

list( $headers, $body ) = split( "\r\n\r\n", $result, 2 );

$headers = split( "\r\n", $headers );

foreach( $headers as $header ) {
	list( $header_name, $header_val ) = split( ':', $header, 2 );

	$headers[$header_name] = $header;
}

header( $headers[0] );
header( $headers['Content-Type'] );

echo $body;
