var anotherStatusSocketInit = false;
var anotherStatusSocket_ws;
var anotherStatusSocketTimeout;

function parseAnotherStatusSocketNoteCut(values) {
	let handSide = (values[0] === 0 ? "left" : "right");
	let hand = (values[0] === 0 ? leftHandTotal : rightHandTotal);

	hand[3]++;
	hand[0] += values[1];
	hand[1] += values[2];
	hand[2] += values[3];

	let averages = currentBSState.averages[handSide];

	if(hand[3]) {
		postToBSEventChannel({
			type: "hand",
			data: handSide
		});

		// do NOT divide by zero
		averages[0] = hand[0] / hand[3];
		averages[1] = hand[1] / hand[3];
		averages[2] = hand[2] / hand[3];
	}

	postToBSEventChannel({
		type: "state",
		data: currentBSState
	});
}

const anotherStatusSocketFunctions = {
	hello: function(data) {
		console.log(`Connected to Beat Saber v${data.gameVersion} (AnotherStatusSocket v${data.version})`);
		changeStatusCircle("BSAnotherStatusSocketStatus", "green", `connected (v${data.gameVersion.split("_")[0]}, mod v${data.version})`);
	},

	map: async function(data) {
		currentBSSong = {
			song: {
				title: data.Title,
				subtitle: data.Subtitle || "",
				artist: data.Artist,
				duration: data.Duration * 1000
			},
			map: {
				characteristic: data.Characteristic,
				difficulty: data.Difficulty,
				hash: data.LevelId.toLowerCase(),
				author: data.Mappers.join(", "),
				bsr: null,
				uploaders: [],
				pack: null,
				modifiers: {
					DA: data.Modifiers.disappearingArrows,
					FS: data.Modifiers.songSpeed === "Faster",
					BE: data.Modifiers.energyType === "Battery",
					GN: data.Modifiers.ghostNotes,
					NA: data.Modifiers.noArrows,
					NB: data.Modifiers.noBombs,
					NF: data.Modifiers.noFailOn0Energy,
					NO: data.Modifiers.enabledObstacleType === "NoObstacles",
					IF: data.Modifiers.instaFail,
					PM: data.Modifiers.proMode,
					SS: data.Modifiers.songSpeed === "Slower",
					SC: data.Modifiers.smallCubes,
					SA: data.Modifiers.strictAngles,
					SF: data.Modifiers.songSpeed === "SuperFast"
				}
			},
			cover: {
				colors: {
					light: localStorage.getItem("setting_bs_artistColor"),
					dark: localStorage.getItem("setting_bs_artistColor")
				},
				internal: {
					image: data.CoverArt || null,
				},
				external: {
					image: null,
					url: null
				}
			},
			colors: {
				left: `#${data.Colors[0]}`,
				right: `#${data.Colors[1]}`
			},
			status: {
				ranked: false,
				qualified: false,
				curated: false,
				verified: false
			}
		};

		currentHandColors = currentBSSong.colors;
		currentBSState.acc = 0;
		currentBSState.averages = {
			left: 0,
			right: 0
		};

		await updateBeatSaberMapData();
	},

	cutScore: function(values) {
		parseAnotherStatusSocketNoteCut(values)
	},

	elapsed: function(elapsed) {
		currentBSState.elapsed = elapsed;

		postToBSEventChannel({
			type: "state",
			data: currentBSState
		});
	},

	health: function(health) {
		currentBSState.health = health;

		postToBSEventChannel({
			type: "state",
			data: currentBSState
		});
	},

	combo: function(data) {
		currentBSState.combo = data.current;

		postToBSEventChannel({
			type: "state",
			data: currentBSState
		});
	},

	cuts: function(data) {
		currentBSState.hits = data.goodCuts;
		currentBSState.misses = data.mistakes;

		postToBSEventChannel({
			type: "state",
			data: currentBSState
		});
	},

	score: function(data) {
		currentBSState.acc = data.accuracy;
		currentBSState.score = data.modified;
		currentBSState.fcacc = data.fullCombo.accuracy;

		postToBSEventChannel({
			type: "state",
			data: currentBSState
		});
	},

	playing: function(state) {
		currentBSState.scene = (state ? "Playing" : "Menu");
		if(!state) {
			currentBSState.state = "stopped";
		}

		postToBSEventChannel({
			type: "scene",
			data: currentBSState.scene
		});
	},

	paused: function(state) {
		currentBSState.state = (state ? "paused" : "playing");

		postToBSEventChannel({
			type: "state",
			data: currentBSState
		});
	}
}

function startAnotherStatusSocketWebsocket() {
	if(anotherStatusSocketInit) {
		return;
	}

	if(localStorage.getItem("setting_beatSaberDataMod") !== "anotherstatussocket") {
		return;
	}

	changeStatusCircle("BSAnotherStatusSocketStatus", "red", "disconnected");

	anotherStatusSocketInit = true;

	console.log("Starting connection to AnotherStatusSocket...");
	let url = `ws://127.0.0.1:${localStorage.getItem("setting_anotherstatussocket_port")}`;

	anotherStatusSocket_ws = new WebSocket(url);
	anotherStatusSocket_ws.hasSeenFirstMessage = false;

	anotherStatusSocket_ws.addEventListener("message", function(msg) {
		var data = JSON.parse(msg.data);

		if(!anotherStatusSocket_ws.hasSeenFirstMessage) {
			anotherStatusSocket_ws.hasSeenFirstMessage = true;
			changeStatusCircle("BSAnotherStatusSocketStatus", "green", "connected");
		}
		
		if(data.EventType in anotherStatusSocketFunctions) {
			anotherStatusSocketFunctions[data.EventType](data.Data);
		}
	});

	anotherStatusSocket_ws.addEventListener("open", function() {
		console.log(`Connected to AnotherStatusSocket websocket at ${url}`);
		changeStatusCircle("BSAnotherStatusSocketStatus", "green", "connected");

		addNotification("Connected to AnotherStatusSocket", {bgColor: "var(--notif-color-success)", duration: 5});
	});

	anotherStatusSocket_ws.addEventListener("close", function() {
		anotherStatusSocketInit = false;

		console.log(`Connection to AnotherStatusSocket websocket ${url} failed, retrying in 20 seconds...`);
		changeStatusCircle("BSAnotherStatusSocketStatus", "red", "disconnected");

		clearTimeout(anotherStatusSocketTimeout);
		anotherStatusSocketTimeout = setTimeout(startAnotherStatusSocketWebsocket, 20000);

		addNotification("Disconnected from AnotherStatusSocket", {bgColor: "var(--notif-color-fail)", duration: 5});

		delete anotherStatusSocket_ws;
	});
}