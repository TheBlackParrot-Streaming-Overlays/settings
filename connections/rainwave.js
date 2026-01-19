// uses various stuff from external_music.js

var rainwaveStationData = {};
async function getRainwaveStations() {
	const rainwaveInstance = new URL(localStorage.getItem("setting_mus_rainwaveInstance"));
	rainwaveInstance.pathname = "/api4/stations";

	const response = await fetch(rainwaveInstance);
	if(!response.ok) {
		console.log("failed to fetch rainwave stations");
		return;
	}

	const jsonData = await response.json();
	rainwaveStationData = jsonData.stations;
}

async function updateRainwaveStationSelection() {
	await getRainwaveStations();

	$("#mus_rainwaveStation").empty();

	let previousStationPresent = false;
	for(let i in rainwaveStationData) {
		let station = rainwaveStationData[i];
		let option = $(`<option value="${station.id}">${station.name}</option>`);

		$("#mus_rainwaveStation").append(option);

		if(localStorage.getItem("setting_mus_rainwaveStation") == station.id) {
			previousStationPresent = true;
		}
	}

	if(previousStationPresent) {
		$("#mus_rainwaveStation").val(localStorage.getItem("setting_mus_rainwaveStation"));
	}

	FancySelect.update($("#mus_rainwaveStation")[0]);
}

var rainwaveTimeout;
async function startRainwaveDataFetching() {
	clearTimeout(rainwaveTimeout);
	await updateRainwaveData();
}

var rainwaveStateTimerInterval;
function rainwaveStateTimer() {
	currentMusicState.elapsed++;

	postToMusicEventChannel({
		event: "state",
		data: currentMusicState
	});
}

var artIsAllowed = true;
async function updateRainwaveData() {
	// as a heads up to future me: their API docs are wrong

	console.log("requesting update from rainwave...");

	let rainwaveFetch = new URL(localStorage.getItem("setting_mus_rainwaveInstance"));
	rainwaveFetch.pathname = "/api4/info";
	let searchParams = new URLSearchParams({
		sid: localStorage.getItem("setting_mus_rainwaveStation")
	});
	rainwaveFetch.search = searchParams.toString();

	const response = await fetch(rainwaveFetch);
	if(!response.ok) {
		console.log("failed to fetch rainwave station statuses");
		return;
	}

	const jsonData = await response.json();
	const trackData = jsonData.sched_current.songs[0];

	let previousSong;
	if(currentSong) {
		previousSong = currentSong.id;
	}
	let newSong = trackData.id;

	if(newSong != previousSong) {
		const albumArtURL = new URL(localStorage.getItem("setting_mus_rainwaveInstance"));
		albumArtURL.pathname = `${trackData.albums[0].art}_240.jpg`;

		if(artIsAllowed) {
			try {
				persistentData.art = await compressImage(albumArtURL.toString(), parseInt(localStorage.getItem("setting_spotify_artImageSize")), parseInt(localStorage.getItem("setting_spotify_artImageQuality")) / 100, "spotify", 180);
			} catch(err) {
				if(err instanceof TypeError) {
					// more than likely a CORS issue. welp
					artIsAllowed = false;
					console.warn("No album art is available for this Rainwave instance, cross-origin resource sharing has not been allowed");
				}
			}
		}

		// using the labels field as it essentially acts the same as "where is this stream from"
		currentSong = {
			title: trackData.title,
			artists: trackData.artists.map((artist) => { return artist.name; }),
			album: {
				name: trackData.albums[0].name,
			},
			duration: trackData.length,
			id: trackData.id
		};

		if(localStorage.getItem("setting_mus_rainwaveStationDisplayName")) {
			const wantedStation = rainwaveStationData.filter((station) => {
				return station.id == localStorage.getItem("setting_mus_rainwaveStation");
			})[0].name;
			currentSong.labels = [`${localStorage.getItem("setting_mus_rainwaveStationDisplayName")} (${wantedStation})`];
		}

		if(persistentData.art) {
			await updateArtColors(persistentData.art);
			currentSong.album.art = {
				data: persistentData.art,
				url: albumArtURL.toString(),
				colors: persistentData.colors
			};
		}

		postToMusicEventChannel({
			event: "track",
			data: currentSong
		});
	}

	currentMusicState = {
		playing: true, // always playing
		elapsed: jsonData.api_info.time - jsonData.sched_current.start_actual
	};
	postToMusicEventChannel({
		event: "state",
		data: currentMusicState
	});

	rainwaveTimeout = setTimeout(startRainwaveDataFetching, (trackData.length - (jsonData.api_info.time - jsonData.sched_current.start_actual) + 5) * 1000);

	console.log("updated rainwave");
}