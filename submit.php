<?php
/**
 * Web Foundation - Post to Google Spreadsheets
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

if( $method != 'POST' && $method != 'PUT' ) {
	fail( "Invalid method" );
}

$payload = '<entry xmlns="http://www.w3.org/2005/Atom" xmlns:gsx="http://schemas.google.com/spreadsheets/2006/extended">';

foreach( $_POST as $var => $val ) {
	$payload .= '<gsx:' . $var . '>' . $val . '</gsx:' . $var . '>';
}

$payload .= '</entry>';

$ch = curl_init( $url );

curl_setopt( $ch, CURLOPT_CUSTOMREQUEST, $method );
curl_setopt( $ch, CURLOPT_POSTFIELDS, $payload );
curl_setopt( $ch, CURLOPT_RETURNTRANSFER, true );
curl_setopt( $ch, CURLOPT_HEADER, true );
curl_setopt( $ch, CURLOPT_HTTPHEADER, array(
	'Authorization: Bearer ' . $accessToken,
	'Content-Type: application/atom+xml'
) );

$result = curl_exec( $ch );

list( $headers, $body ) = split( "\r\n\r\n", $result, 2 );

$headers = split( "\r\n", $headers );

foreach( $headers as $header ) {
	list( $header_name, $header_val ) = split( ':', $header, 2 );

	$headers[$header_name] = $header;
}

header( $headers[0] );
header( $header['Content-Type'] );

echo $body;
