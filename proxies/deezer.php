<?php
if(isset($_GET['art'])) {
	header('Content-type: image/jpeg');

	$artHash = preg_replace("/[^a-f0-9]/", '', strtolower($_GET['art']));
	if(strlen($artHash) != 32) {
		http_response_code(404);
		die();
	}

	$artSize = "250x250";
	switch ($_GET['size']) {
		case 'small':
			$artSize = "56x56";
			break;
		case 'big':
			$artSize = "500x500";
			break;
		case 'xl':
			$artSize = "1000x1000";
			break;
	}

	echo file_get_contents('https://cdn-images.dzcdn.net/images/cover/' . $artHash . '/' . $artSize . '-000000-80-0-0.jpg');
} else {
	header('Content-type: application/json');

	$artist = null;
	$title = null;
	$album = null;
	$isrc = null;
	$id = null;

	if(isset($_GET['artist'])) {
		$artist = preg_replace("/[\.\-\/\\\:\"\?\=\&]/", ' ', strtoupper($_GET['artist']));
	}
	if(isset($_GET['title'])) {
		$title = preg_replace("/[\.\-\/\\\:\"\?\=\&]/", ' ', strtoupper($_GET['title']));
	}
	if(isset($_GET['album'])) {
		$album = preg_replace("/[\.\-\/\\\:\"\?\=\&]/", ' ', strtoupper($_GET['album']));
	}
	if(isset($_GET['isrc'])) {
		$isrc = preg_replace("/[^A-Z0-9]/", '', strtoupper($_GET['isrc']));
	}
	if(isset($_GET['id'])) {
		if(!is_numeric($_GET['id'])) {
			http_response_code(404);
			die();
		}

		$id = intval($_GET['id']);
	}

	if(!is_null($isrc)) {
		echo file_get_contents('https://api.deezer.com/track/isrc:' . urlencode($isrc));
		die();
	}
	if(!is_null($id)) {
		echo file_get_contents('https://api.deezer.com/track/' . urlencode($id));
		die();
	}

	$parts = [];
	if(!is_null($artist)) {
		$parts[] = 'artist:"' . $artist . '"';
	}
	if(!is_null($title)) {
		$parts[] = 'track:"' . $title . '"';
	}
	if(!is_null($album)) {
		$parts[] = 'album:"' . $album . '"';
	}

	if(count($parts) == 0) {
		http_response_code(404);
		die();
	}

	$queryStr = urlencode(implode(" ", $parts));
	echo file_get_contents('https://api.deezer.com/search/track?strict=on&q=' . $queryStr);
}
?>