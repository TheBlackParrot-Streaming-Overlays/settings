// uses various stuff from external_music.js

// rainwave and azuracast init are fairly similar lol

var azuracastStationData = [];
async function getAzuraCastStations() {
	const azuracastInstance = new URL(localStorage.getItem("setting_mus_azuracastInstance"));
	azuracastInstance.pathname = "/api/nowplaying";

	const response = await fetch(azuracastInstance);
	if(!response.ok) {
		console.log("failed to fetch azuracast stations");
		return;
	}

	const jsonData = await response.json();
	azuracastStationData = jsonData;
}

async function updateAzuraCastStationSelection() {
	await getAzuraCastStations();

	$("#mus_azuracastStation").empty();

	let previousStationPresent = false;
	for(let i in azuracastStationData) {
		let station = azuracastStationData[i].station;
		let option = $(`<option value="${station.id}">${station.name}</option>`);

		$("#mus_azuracastStation").append(option);

		if(localStorage.getItem("setting_mus_azuracastStation") == station.id) {
			previousStationPresent = true;
		}
	}

	if(previousStationPresent) {
		$("#mus_azuracastStation").val(localStorage.getItem("setting_mus_azuracastStation"));
	}

	FancySelect.update($("#mus_azuracastStation")[0]);
}

var azuracastSSE;
async function startAzuraCastDataFetching() {
	if(!azuracastStationData) {
		// uh
		await getAzuraCastStations();
	}

	const azuracastInstance = new URL(localStorage.getItem("setting_mus_azuracastInstance"));
	azuracastInstance.pathname = "/api/live/nowplaying/sse";

	const shortcode = azuracastStationData.filter((item) => {
		return item.station.id == localStorage.getItem("setting_mus_azuracastStation");
	})[0].station.shortcode;
	const connectJSON = {
		subs: {}
	};
	connectJSON.subs[`station:${shortcode}`] = { "recover": true }

	const searchParams = new URLSearchParams({
		"cf_connect": JSON.stringify(connectJSON)
	});
	azuracastInstance.search = searchParams.toString();

	currentMusicState = {
		playing: true, // always playing
		elapsed: 0
	};

	if(typeof azuracastSSE !== "undefined") {
		azuracastSSE.onmessage = function(){}; // i am paranoid
		azuracastSSE.close();
	}

	azuracastSSE = new EventSource(azuracastInstance);
	azuracastSSE.onmessage = handleAzuraCastSSEMessage;
}

var azuracastStateTimerInterval;
function azuracastStateTimer() {
	currentMusicState.elapsed++;

	postToMusicEventChannel({
		event: "state",
		data: currentMusicState
	});
}

var azuracastArtIsAllowed = true;
var processingMetadata;
async function handleAzuraCastSSEData(payload) {
	const trackData = payload.data.np;
	const metadata = trackData.now_playing.song;

	if(currentSong) {
		if("id" in currentSong) {
			if(metadata.id == currentSong.id) {
				currentMusicState.elapsed = trackData.now_playing.elapsed;
				return;
			}
		}
	}

	if(processingMetadata == metadata.id) {
		return;
	}

	processingMetadata = metadata.id;

	currentSong = {
		title: metadata.title,
		artists: [metadata.artist],
		album: {
			name: metadata.album
		},
		duration: trackData.now_playing.duration
	};

	if(azuracastArtIsAllowed) {
		try {
			persistentData.art = await compressImage(metadata.art, parseInt(localStorage.getItem("setting_spotify_artImageSize")), parseInt(localStorage.getItem("setting_spotify_artImageQuality")) / 100, "spotify", 180);
		} catch(err) {
			if(err instanceof TypeError) {
				// more than likely a CORS issue. welp
				azuracastArtIsAllowed = false;
				console.warn("No album art is available for this AzuraCast instance, cross-origin resource sharing has not been allowed");
			}
		}
	}

	// using the labels field as it essentially acts the same as "where is this stream from"
	currentSong = {
		title: metadata.title,
		artists: [metadata.artist],
		album: {
			name: metadata.album
		},
		duration: trackData.now_playing.duration,
		id: metadata.id
	};

	let useISRC = false;
	if("isrc" in metadata) {
		if(metadata.isrc.length > 0) {
			useISRC = true;
		}
	}

	if(useISRC) {
		currentSong.isrc = metadata.isrc;
	} else {
		if(localStorage.getItem("setting_mus_azuracastStationDisplayName")) {
			const wantedStation = azuracastStationData.filter((item) => {
				return item.station.id == localStorage.getItem("setting_mus_azuracastStation");
			})[0].station.name;
			currentSong.labels = [`${localStorage.getItem("setting_mus_azuracastStationDisplayName")} (${wantedStation})`];
		}
	}

	await parseExtraData(currentSong);

	if("custom_fields" in metadata) {
		if("comment" in metadata.custom_fields) {
			if(metadata.custom_fields.comment) {
				currentSong.comment = metadata.custom_fields.comment;
			}
		}
		if("year" in metadata.custom_fields) {
			if(metadata.custom_fields.year) {
				currentSong.album.released = (persistentData.year ? persistentData.year : new Date(metadata.custom_fields.year).getUTCFullYear())
			}
		}
	}

	if(persistentData.art) {
		await updateArtColors(persistentData.art);
		currentSong.album.art = {
			data: persistentData.art,
			url: metadata.art,
			colors: persistentData.colors
		};
	}

	if("labels" in persistentData) {
		if(persistentData.labels.length) {
			currentSong.labels = persistentData.labels;
		}
	}

	currentMusicState.elapsed = trackData.now_playing.elapsed;
	postToMusicEventChannel({
		event: "state",
		data: currentMusicState
	});

	postToMusicEventChannel({
		event: "track",
		data: currentSong
	});
}

async function handleAzuraCastSSEMessage(event) {
	const jsonData = JSON.parse(event.data);

	if ("connect" in jsonData) {
		const connectData = jsonData.connect;

		if ("data" in connectData) {
			// Legacy SSE data
			connectData.data.forEach(
				async (initialRow) => await handleAzuraCastSSEData(initialRow)
			);
		} else {
			// New Centrifugo cached NowPlaying initial push.
			for (const subName in connectData.subs) {
				const sub = connectData.subs[subName];
				if ("publications" in sub) {
					sub.publications.forEach(async (initialRow) => await handleAzuraCastSSEData(initialRow));
				}
			}
		}
	} else if ("pub" in jsonData) {
		await handleAzuraCastSSEData(jsonData.pub);
	}
}