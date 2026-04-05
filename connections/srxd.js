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
	art = currentSRXDSong.cover.internal.image;
	if(art !== null) {
		// (this is fine, it's only here to use image data)
		$("#bsplusImageContainer").attr("src", art);
		let swatches = await Vibrant.from($("#bsplusImageContainer")[0]).getSwatches();
		let colors = {
			light: [],
			dark: []
		};
		let skip = [];

		const checks = {
			light: {
				Vibrant: 3,
				LightVibrant: 2,
				LightMuted: 1,
				Muted: 0.5
			},

			dark: {
				DarkVibrant: 3,
				DarkMuted: 2.5,
				Muted: 0.75,
				Vibrant: 0.5
			}
		};

		for(const shade in checks) {
			for(const swatchName in checks[shade]) {
				if(skip.indexOf(swatchName) !== -1) {
					// we're already using the color, move on
					continue;
				}

				let weightFactor = checks[shade][swatchName];
				const color = swatches[swatchName];

				let weight = Math.max(weightFactor, color.population * weightFactor);

				const hsl = color.getHsl();
				if(hsl[1] <= 0.25) {
					// very close to white or black, weight it down heavily
					if(hsl[2] >= 0.75 || hsl[2] <= 0.15) {
						weight *= 0.25;
					}
				}

				colors[shade].push({
					swatchName: swatchName,
					weight: weight,
					color: color
				});
			}

			colors[shade].sort((a, b) => {
				if(a.weight == b.weight) { return 0; }
				return (a.weight < b.weight ? 1 : -1);
			});

			skip.push(colors[shade][0].swatchName);
		}

		console.log(colors);

		currentSRXDSong.cover.colors.dark = colors.dark[0].color.getHex();
		currentSRXDSong.cover.colors.light = colors.light[0].color.getHex();
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