const AnotherSpinStatusMessageHandlers = {
	"Scene": function(data) {
		currentSRXDState.scene = data.Data;
		currentSRXDState.timestamp = Date.now();

		if(data.Data === "Playing") {
			currentSRXDState.state = "playing";
			currentSRXDState.combo = 0;
			currentSRXDState.hits = 0;
			currentSRXDState.misses = 0;
			currentSRXDState.score = 0;
			currentSRXDState.fcState = "PerfectPlus";
			currentSRXDState.health = 1;
			currentSRXDState.perfectPlusHits = 0;
		} else {
			currentSRXDState.state = "stopped";
		}

		postToSRXDEventChannel({
			type: "state",
			data: currentSRXDState
		});
	},

	"MapData": async function(data) {
		data = data.Data;

		postToSRXDEventChannel({
			type: "reset"
		});

		currentSRXDSong = {
			song: {
				title: data.Title,
				subtitle: data.Subtitle,
				artist: data.Artist,
				duration: data.Duration
			},
			map: {
				difficulty: data.Difficulty,
				rating: data.Rating,
				hash: data.FileReference,
				author: data.Charter,
				code: null,
				uploaders: []
			},
			cover: {
				colors: {
					light: localStorage.getItem("setting_bs_artistColor"),
					dark: localStorage.getItem("setting_bs_artistColor")
				},
				internal: {
					image: `data:image/jpg;base64,${data.CoverArt}`
				},
				external: {
					image: null,
					url: null
				}
			}
		};

		await updateSRXDMapData();
	},

	"Score": function(data) {
		data = data.Data;

		currentSRXDState.acc = data.Accuracy;
		currentSRXDState.combo = data.Combo;
		currentSRXDState.hits = data.NotesHit;
		currentSRXDState.misses = data.NotesMissed;
		currentSRXDState.score = data.Score;
		currentSRXDState.maxScore = (data.BaseScore + data.BaseScoreLost) * 4;
		currentSRXDState.health = data.Health;
		currentSRXDState.fcState = data.FullComboState;

		postToSRXDEventChannel({
			type: "state",
			data: currentSRXDState
		});
	},

	"Paused": function(data) {
		currentSRXDState.state = data.Data ? "paused" : "playing";
		currentSRXDState.timestamp = Date.now();

		postToSRXDEventChannel({
			type: "state",
			data: currentSRXDState
		});
	},

	"NoteTiming": function(data) {
		if(data.Data.indexOf("PerfectPlus") !== -1) {
			currentSRXDState.perfectPlusHits++;

			postToSRXDEventChannel({
				type: "state",
				data: currentSRXDState
			});
		}

		postToSRXDEventChannel({
			type: "hit",
			data: data.Data
		});
	}
}

// haha "ass" haha
var srxdInit_ass = false;
var srxd_ass_ws;
var srxdTimeout_ass;
function startAnotherSpinStatusWebsocket() {
	if(srxdInit_ass) {
		return;
	}

	changeStatusCircle("AnotherSpinStatusStatus", "red", "disconnected");

	srxdInit_ass = true;

	console.log("Starting connection to AnotherSpinStatus...");
	let url = `ws://127.0.0.1:${localStorage.getItem("setting_anotherspinstatus_port")}/`;

	srxd_ass_ws = new WebSocket(url);
	srxd_ass_ws.hasSeenFirstMessage = false;

	srxd_ass_ws.addEventListener("message", async function(msg) {
		var data = JSON.parse(msg.data);
		//console.log(data);

		if(!srxd_ass_ws.hasSeenFirstMessage) {
			srxd_ass_ws.hasSeenFirstMessage = true;
			console.log(`Connected to AnotherSpinStatus`);
			changeStatusCircle("AnotherSpinStatusStatus", "green", `connected`);
		}

		if("EventType" in data) {
			if(data.EventType in AnotherSpinStatusMessageHandlers) {
				AnotherSpinStatusMessageHandlers[data.EventType](data);
			}
		}
	});

	srxd_ass_ws.addEventListener("open", function() {
		console.log(`Connected to AnotherSpinStatus websocket at ${url}`);
		changeStatusCircle("AnotherSpinStatusStatus", "green", "connected");

		addNotification("Connected to AnotherSpinStatus", {bgColor: "var(--notif-color-success)", duration: 5});
	});

	srxd_ass_ws.addEventListener("close", function() {
		srxdInit_ass = false;

		console.log(`Connection to AnotherSpinStatus websocket ${url} failed, retrying in 20 seconds...`);
		changeStatusCircle("AnotherSpinStatusStatus", "red", "disconnected");

		clearTimeout(srxdTimeout_ass);
		srxdTimeout_ass = setTimeout(startAnotherSpinStatusWebsocket, 20000);

		addNotification("Disconnected from AnotherSpinStatus", {bgColor: "var(--notif-color-fail)", duration: 5});

		delete srxd_ass_ws;
	});
}