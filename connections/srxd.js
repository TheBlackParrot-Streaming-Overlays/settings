const srxdEventChannel = new BroadcastChannel("srxd");
function postToSRXDEventChannel(data) {
	if(data) {
		srxdEventChannel.postMessage(data);
	}
}

var currentSRXDState = {
	state: "stopped",
	elapsed: 0,
	timestamp: Date.now(),
	acc: 1,
	combo: 0,
	hits: 0,
	misses: 0,
	score: 0,
	fcState: "PerfectPlus",
	maxScore: 20000,
	scene: "Menu",
	health: 1,
	perfectPlusHits: 0
};

var oldSRXDHash;
var currentSRXDSong = null;

async function updateSRXDMapData() {
	// TODO: look into adding a filename property or something to SpinStatus's output if it's a custom map

	let art;
	let swatches;
	/*if(localStorage.getItem("setting_srxd_useRemoteArtURL") === "true") {
		art = currentSRXDSong.cover.external.image;
		if(art === null && currentSRXDSong.cover.internal.image !== null) {
			art = currentSRXDSong.cover.internal.image;
		}
	} else {
		art = currentSRXDSong.cover.internal.image;
	}*/
	art = currentSRXDSong.cover.internal.image;
	if(art !== null) {
		// (this is fine, it's only here to use image data)
		$("#bsplusImageContainer").attr("src", art);
		swatches = await Vibrant.from($("#bsplusImageContainer")[0]).getSwatches();

		let colors = {
			light: [],
			dark: []
		};
		const checks = {
			light: ["LightVibrant", "Vibrant", "LightMuted", "Muted"],
			dark: ["DarkVibrant", "DarkMuted", "Muted", "Vibrant"]
		};

		for(let shade in checks) {
			for(let i in checks[shade]) {
				let check = checks[shade][i];
				if(check in swatches) {
					if(swatches[check] !== null) {
						colors[shade].push(swatches[check].getRgb());
					}
				}
			}
		}
		currentSRXDSong.cover.colors.dark = `#${colors.dark[0].map(function(x) { return Math.floor(x).toString(16).padStart(2, "0"); }).join("")}`;
		currentSRXDSong.cover.colors.light = `#${colors.light[0].map(function(x) { return Math.floor(x).toString(16).padStart(2, "0"); }).join("")}`;
	}

	postToSRXDEventChannel({
		type: "map",
		data: currentSRXDSong
	});
}

function connectSpinRhythmXD() {
	switch(localStorage.getItem("setting_srxdDataMod")) {
		case "spinstatus":
			startSpinStatusWebsocket();
			break;

		case "anotherspinstatus":
			startAnotherSpinStatusWebsocket();
			break;
	}
}