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

		if(getYIQ(currentSRXDSong.cover.colors.light) <= 96 && getYIQ(currentSRXDSong.cover.colors.dark) <= 64) {
			console.log("both colors are pretty dark, force the light one to be brighter");
			while(getYIQ(currentSRXDSong.cover.colors.light) <= 64) {
				console.log("took a brightening step");
				currentSRXDSong.cover.colors.light = interpolateColor(currentSRXDSong.cover.colors.light, "#FFFFFF", 10);
			}
		} else if(getYIQ(currentSRXDSong.cover.colors.light) >= 192 && getYIQ(currentSRXDSong.cover.colors.dark) >= 160) {
			console.log("both colors are pretty bright, force the dark one to be darker");
			while(getYIQ(currentSRXDSong.cover.colors.dark) >= 192) {
				console.log("took a darkening step");
				currentSRXDSong.cover.colors.dark = interpolateColor(currentSRXDSong.cover.colors.dark, "#000000", 10);
			}
		}

		while(Math.abs(getYIQ(currentSRXDSong.cover.colors.light) - getYIQ(currentSRXDSong.cover.colors.dark)) <= 48) {
			console.log(`colors are too similar: light YIQ (${currentSRXDSong.cover.colors.light}) - ${getYIQ(currentSRXDSong.cover.colors.light)}, dark YIQ (${currentSRXDSong.cover.colors.dark}) - ${getYIQ(currentSRXDSong.cover.colors.dark)}`);
			currentSRXDSong.cover.colors.light = interpolateColor(currentSRXDSong.cover.colors.light, "#FFFFFF", 10);
			currentSRXDSong.cover.colors.dark = interpolateColor(currentSRXDSong.cover.colors.dark, "#000000", 10);
		}
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