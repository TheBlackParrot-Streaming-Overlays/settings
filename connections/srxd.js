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
	health: 1
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

var sceneSwitchSRXDTimeout;
const SRXDMessageHandlers = {
	"trackStart": async function(data) {
		postToSRXDEventChannel({
			type: "reset"
		});
		clearTimeout(sceneSwitchSRXDTimeout); // trackEnd is fired on restarts, immediately followed by a trackStart event

		data = data.status;

		if(data.feat !== "") {
			data.title = `${data.title} (feat. ${data.feat})`
		}

		currentSRXDSong = {
			song: {
				title: data.title,
				subtitle: data.subTitle,
				artist: data.artist,
				duration: data.endTime
			},
			map: {
				difficulty: data.difficulty,
				hash: `${data.isCustom ? "C" : "B"}_${data.title}_${data.subtitle}_${data.artist}_${data.charter}`,
				author: data.charter,
				code: null,
				uploaders: []
			},
			cover: {
				colors: {
					light: localStorage.getItem("setting_bs_artistColor"),
					dark: localStorage.getItem("setting_bs_artistColor")
				},
				internal: {
					image: `data:image/png;base64,${data.albumArt}`
				},
				external: {
					image: null,
					url: null
				}
			}
		};

		currentSRXDState.scene = "Playing";
		currentSRXDState.state = "playing";
		currentSRXDState.timestamp = Date.now();
		currentSRXDState.combo = 0;
		currentSRXDState.hits = 0;
		currentSRXDState.misses = 0;
		currentSRXDState.score = 0;
		currentSRXDState.fcState = "PerfectPlus";
		currentSRXDState.health = 1;

		postToSRXDEventChannel({
			type: "state",
			data: currentSRXDState
		});

		oldSRXDHash = null;

		await updateSRXDMapData();
	},

	"trackPause": function() {
		currentSRXDState.state = "paused";
		//currentBSState.elapsed = data.pauseTime;
		currentSRXDState.timestamp = Date.now();

		postToSRXDEventChannel({
			type: "state",
			data: currentSRXDState
		});
	},

	"trackEnd": function() {
		sceneSwitchSRXDTimeout = setTimeout(function() {
			currentSRXDState.scene = "Menu";
			currentSRXDState.state = "stopped";

			currentSRXDState.timestamp = Date.now();

			postToSRXDEventChannel({
				type: "state",
				data: currentSRXDState
			});
		}, 1000);
	},

	"trackResume": function() {
		currentSRXDState.state = "playing";
		//currentBSState.elapsed = data.pauseTime;
		currentSRXDState.timestamp = Date.now();

		postToSRXDEventChannel({
			type: "state",
			data: currentSRXDState
		});
	},

	"scoreEvent": function(data) {
		data = data.status;

		currentSRXDState.combo = data.combo;
		currentSRXDState.health = data.health / data.maxHealth;
		currentSRXDState.fcState = data.fullCombo;
		currentSRXDState.score = data.score;

		postToSRXDEventChannel({
			type: "state",
			data: currentSRXDState
		});
	},

	"noteEvent": function(data) {
		data = data.status;

		if(data.accuracy !== "None" && data.accuracy !== "Failed") {
			currentSRXDState.hits++;
		} else {
			currentSRXDState.misses++;
		}

		//console.log(data.type, data.accuracy);

		if(data.accuracy !== "Valid") {
			postToSRXDEventChannel({
				type: "hit",
				data: data.accuracy.replace("Early", "")
			});
		}

		postToSRXDEventChannel({
			type: "state",
			data: currentSRXDState
		});
	}
}

var srxdInit = false;
var srxd_ws;
var srxdTimeout;
function startSpinStatusWebsocket() {
	if(srxdInit) {
		return;
	}

	changeStatusCircle("SpinStatusStatus", "red", "disconnected"); // lol

	srxdInit = true;

	console.log("Starting connection to SpinStatus...");
	let url = `ws://127.0.0.1:${localStorage.getItem("setting_spinstatus_port")}/`;

	srxd_ws = new WebSocket(url);
	srxd_ws.hasSeenFirstMessage = false;

	srxd_ws.addEventListener("message", async function(msg) {
		var data = JSON.parse(msg.data);
		//console.log(data);

		if(!srxd_ws.hasSeenFirstMessage) {
			srxd_ws.hasSeenFirstMessage = true;
			console.log(`Connected to SpinStatus`);
			changeStatusCircle("SpinStatusStatus", "green", `connected`);
		}

		if("type" in data) {
			if(data.type in SRXDMessageHandlers) {
				SRXDMessageHandlers[data.type](data);
			}
		}

		/*if(data._type === "event") {
			if(data._event in BSPlusMessageHandlers) {
				BSPlusMessageHandlers[data._event](data);
			} else {
				postToBSEventChannel({
					type: "unknown",
					data: data
				});
			}
		}*/
	});

	srxd_ws.addEventListener("open", function() {
		console.log(`Connected to SpinStatus websocket at ${url}`);
		changeStatusCircle("SpinStatusStatus", "green", "connected");

		addNotification("Connected to SpinStatus", {bgColor: "var(--notif-color-success)", duration: 5});
	});

	srxd_ws.addEventListener("close", function() {
		srxdInit = false;

		console.log(`Connection to SpinStatus websocket ${url} failed, retrying in 20 seconds...`);
		changeStatusCircle("SpinStatusStatus", "red", "disconnected");

		clearTimeout(srxdTimeout);
		srxdTimeout = setTimeout(startSpinStatusWebsocket, 20000);

		addNotification("Disconnected from SpinStatus", {bgColor: "var(--notif-color-fail)", duration: 5});

		delete srxd_ws;
	});
}