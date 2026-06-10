var currentBSSong = null;
var currentBSState = {
	state: "stopped",
	elapsed: 0,
	timestamp: Date.now(),
	acc: 1,
	fcacc: NaN,
	averages: {
		left: [0, 0, 0],
		right: [0, 0, 0]
	},
	combo: 0,
	hits: 0,
	misses: 0,
	score: 0,
	maxScore: 0,
	scene: "Menu"
};
var oldScene;
var currentHandColors = {
	left: "#ffffff",
	right: "#ffffff"
};
var leftHandTotal = [0, 0, 0, 0];
var rightHandTotal = [0, 0, 0, 0];

var mapPacks = {};
async function getMapPacks() {
	const response = await fetch(`./connections/beatsaber_packs.json?sigh=${Date.now()}`);
	if(!response.ok) {
		console.log("failed to fetch beat saber map pack data");
		return;
	}

	mapPacks = await response.json();
}

const bsEventChannel = new BroadcastChannel("bs");
function postToBSEventChannel(data) {
	if(data) {
		bsEventChannel.postMessage(data);
	}
}

async function getCachedBeatSaverUserData(url) {
	const cacheStorage = await caches.open("beatSaverCache");

	var cachedResponse = await cacheStorage.match(url);
	if(!cachedResponse) {
		const newResponse = await fetch(url);
		if(!newResponse.ok) {
			return {};
		}
		var userData = await newResponse.text();
		var userDataJSON = JSON.parse(userData);

		cachedResponse = new Response(userData, {
			headers: {
				'Content-Type': "application/json",
				'X-Cache-Timestamp': Date.now()
			}
		});
		await cacheStorage.put(`https://api.beatsaver.com/users/id/${userDataJSON.id}`, cachedResponse);		
	} else {
		const cacheTimestamp = parseInt(cachedResponse.headers.get("X-Cache-Timestamp"));
		const staleThreshold = parseFloat(localStorage.getItem("setting_bsUserCacheExpiryDelay")) * 24 * 60 * 60 * 1000;
		if(Date.now() - cacheTimestamp > staleThreshold) {
			console.log(`cached user data for ${url} is stale, re-fetching...`);
			cacheStorage.delete(url);
			return await getCachedBeatSaverUserData(url);
		}

		return await cachedResponse.json();
	}

	cachedResponse = await cacheStorage.match(url);
	return await cachedResponse.json();
}

async function getCachedMapData(url) {
	const cacheStorage = await caches.open("beatSaverCache");

	var cachedResponse = await cacheStorage.match(url);
	if(!cachedResponse) {
		const newResponse = await fetch(url);
		if(!newResponse.ok) {
			return {};
		}
		var mapData = await newResponse.json();

		// getting more uploader data since the one in the maps endpoints aren't actually the full uploader response
		mapData.uploader = await getCachedBeatSaverUserData(`https://api.beatsaver.com/users/id/${mapData.uploader.id}`);

		cachedResponse = new Response(JSON.stringify(mapData), {
			headers: {
				'Content-Type': "application/json",
				'X-Cache-Timestamp': Date.now()
			}
		});
		await cacheStorage.put(`https://api.beatsaver.com/maps/hash/${mapData.versions[0].hash}`, await cachedResponse.clone());
		await cacheStorage.put(`https://api.beatsaver.com/maps/id/${mapData.id}`, cachedResponse);
	} else {
		const cacheTimestamp = parseInt(cachedResponse.headers.get("X-Cache-Timestamp"));
		const staleThreshold = parseFloat(localStorage.getItem("setting_bsMapCacheExpiryDelay")) * 24 * 60 * 60 * 1000;
		if(Date.now() - cacheTimestamp > staleThreshold) {
			console.log(`cached map data for ${url} is stale, re-fetching...`);
			cacheStorage.delete(url);
			return await getCachedMapData(url);
		}

		return await cachedResponse.json();
	}

	cachedResponse = await cacheStorage.match(url);
	try {
		return await cachedResponse.json();
	} catch(err) {
		return null;
	}
}

function getModifierString(modifiers, concatenator = ",") {
	let out = [];
	for(const modifierKey in modifiers) {
		if(modifiers[modifierKey]) {
			out.push(modifierKey);
		}
	}
	return out.join(concatenator);
}

var oldHash;
async function updateBeatSaberMapData() {
	const curHash = `${currentBSSong.map.hash}.${currentBSSong.song.title}.${currentBSSong.map.difficulty}.${getModifierString(currentBSSong.map.modifiers)}`;
	if(oldHash === curHash) {
		console.log(`old hash is current hash, not updating map data (old: ${oldHash}, new: ${curHash})`);
		return;
	} else {
		console.log(`old hash is not current hash, updating map data (old: ${oldHash}, new: ${curHash})`);
	}
	oldHash = curHash;

	leftHandTotal = [0, 0, 0, 0];
	rightHandTotal = [0, 0, 0, 0];
	currentBSState.averages = {
		left: [0, 0, 0],
		right: [0, 0, 0]
	};

	if(!currentBSSong.song.title) { currentBSSong.song.title = '(no title)'; }
	if(!currentBSSong.song.artist) { currentBSSong.song.artist = '(no artist)'; }
	if(!currentBSSong.map.author) { currentBSSong.map.author = '(unknown mapper)'; }

	if(currentBSSong.map.hash === null) {
		postToBSEventChannel({
			type: "map",
			data: currentBSSong
		});
		return;
	} else {
		postToBSEventChannel({
			type: "hash",
			data: currentBSSong.map.hash
		});

		for(const packName in mapPacks) {
			const pack = mapPacks[packName];
			if(pack.indexOf(currentBSSong.map.hash) !== -1) {
				currentBSSong.map.pack = packName;
				break;
			}
		}
	}

	let bsData = null;
	if(currentBSSong.map.hash.indexOf("wip") === -1 && currentBSSong.map.hash.length === 40) {
		bsData = await getCachedMapData(`https://api.beatsaver.com/maps/hash/${currentBSSong.map.hash}`);

		if(!Object.keys(bsData).length) {
			bsData = null;
		}
	}

	if(bsData !== null) {
		console.log(bsData);
		if(!("verifiedMapper" in bsData.uploader)) {
			bsData.uploader.verifiedMapper = false;
		} else {
			currentBSSong.status.verified = bsData.uploader.verifiedMapper;
		}

		const showAvatar = (bsData.uploader.curator || bsData.uploader.seniorCurator || bsData.uploader.verifiedMapper || bsData.ranked || bsData.qualified || "curator" in bsData);

		if(bsData.ranked || bsData.blRanked) { currentBSSong.status.ranked = true; }
		if(bsData.qualified || bsData.blQualified) { currentBSSong.status.qualified = true; }
		if("curator" in bsData) { currentBSSong.status.curated = true; }

		currentBSSong.map.bsr = bsData.id;
		currentBSSong.map.uploaders = [{
			name: bsData.uploader.name,
			avatar: (showAvatar && !("suspendedAt" in bsData.uploader) ? bsData.uploader.avatar : null)
		}];

		currentBSSong.cover.external.url = bsData.versions[0].coverURL;
		if(sessionStorage.getItem(`_bs_cache_art_${currentBSSong.map.hash}`)) {
			currentBSSong.cover.external.image = sessionStorage.getItem(`_bs_cache_art_${currentBSSong.map.hash}`);
		} else {
			currentBSSong.cover.external.image = await compressImage(bsData.versions[0].coverURL, parseInt(localStorage.getItem("setting_bs_artSize")) * 2, 0.8);
			sessionStorage.setItem(`_bs_cache_art_${currentBSSong.map.hash}`, currentBSSong.cover.external.image);
		}

		if("collaborators" in bsData) {
			const maxCollaborators = (parseInt(localStorage.getItem("setting_bs_maxCollaborators")) || 5);

			for(const collaborator of bsData.collaborators) {
				if(currentBSSong.map.uploaders.length >= maxCollaborators) {
					currentBSSong.map.uploaders.push({
						name: `and ${(bsData.collaborators.length+1) - maxCollaborators} more...`,
						avatar: null
					});
					break;
				}

				const showCollaboratorAvatar = (collaborator.curator || collaborator.seniorCurator || collaborator.verifiedMapper);
				currentBSSong.map.uploaders.push({
					name: collaborator.name,
					avatar: (showCollaboratorAvatar && !("suspendedAt" in collaborator) ? collaborator.avatar : null)
				});
			}
		}

		for(const diffData of bsData.versions[0].diffs) {
			if(diffData.characteristic === currentBSSong.map.characteristic && diffData.difficulty === currentBSSong.map.difficulty) {
				currentBSState.maxScore = diffData.maxScore;
			}
		}
	}

	let art;
	//let swatches;
	// DataPuller doesn't ever send raw image data, it's always remote
	if(localStorage.getItem("setting_bs_useRemoteArtURL") === "true" || localStorage.getItem("setting_beatSaberDataMod") === "datapuller") {
		art = currentBSSong.cover.external.image;
		if(art === null && currentBSSong.cover.internal.image !== null) {
			art = currentBSSong.cover.internal.image;
		}
	} else {
		art = currentBSSong.cover.internal.image;
	}
	if(art !== null) {
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

		currentBSSong.cover.colors.dark = colors.dark[0].color.getHex();
		currentBSSong.cover.colors.light = colors.light[0].color.getHex();

		if(getYIQ(currentBSSong.cover.colors.light) <= 96 && getYIQ(currentBSSong.cover.colors.dark) <= 64) {
			console.log("both colors are pretty dark, force the light one to be brighter");
			while(getYIQ(currentBSSong.cover.colors.light) <= 64) {
				console.log("took a brightening step");
				currentBSSong.cover.colors.light = interpolateColor(currentBSSong.cover.colors.light, "#FFFFFF", 10);
			}
		} else if(getYIQ(currentBSSong.cover.colors.light) >= 192 && getYIQ(currentBSSong.cover.colors.dark) >= 160) {
			console.log("both colors are pretty bright, force the dark one to be darker");
			while(getYIQ(currentBSSong.cover.colors.dark) >= 192) {
				console.log("took a darkening step");
				currentBSSong.cover.colors.dark = interpolateColor(currentBSSong.cover.colors.dark, "#000000", 10);
			}
		}

		while(Math.abs(getYIQ(currentBSSong.cover.colors.light) - getYIQ(currentBSSong.cover.colors.dark)) <= 48) {
			console.log(`colors are too similar: light YIQ (${currentBSSong.cover.colors.light}) - ${getYIQ(currentBSSong.cover.colors.light)}, dark YIQ (${currentBSSong.cover.colors.dark}) - ${getYIQ(currentBSSong.cover.colors.dark)}`);
			currentBSSong.cover.colors.light = interpolateColor(currentBSSong.cover.colors.light, "#FFFFFF", 10);
			currentBSSong.cover.colors.dark = interpolateColor(currentBSSong.cover.colors.dark, "#000000", 10);
		}
	}

	const codeType = localStorage.getItem("setting_bs_qrCodeGlyph");
	const codeECLevel = localStorage.getItem("setting_bs_qrCodeECLevel");
	const codeECLevelFixed = qrCodeECLevelEnum[codeType][codeECLevel];

	currentBSSong.qrCode = btoa(bwipjs.toSVG({
		bcid: codeType,
		text: `https://beatsaver.com/maps/${currentBSSong.map.bsr}`,
		eclevel: codeECLevelFixed,
		barcolor: "#ffffff"
	}));

	postToBSEventChannel({
		type: "map",
		data: currentBSSong
	});
}

var oldQR;
function updateQRCode() {
	const codeType = localStorage.getItem("setting_bs_qrCodeGlyph");
	const codeECLevel = localStorage.getItem("setting_bs_qrCodeECLevel");
	const codeECLevelFixed = qrCodeECLevelEnum[codeType][codeECLevel];

	const qrCodeString = `${codeType}${codeECLevelFixed}`;
	if(oldQR === qrCodeString) {
		return;
	}
	oldQR = qrCodeString;

	currentBSSong.qrCode = btoa(bwipjs.toSVG({
		bcid: codeType,
		text: `https://beatsaver.com/maps/${currentBSSong.map.bsr}`,
		eclevel: codeECLevelFixed,
		barcolor: "#ffffff"
	}));

	postToBSEventChannel({
		type: "qr",
		data: currentBSSong.qrCode
	});	
}

function connectBeatSaber() {
	switch(localStorage.getItem("setting_beatSaberDataMod")) {
		case "anotherstatussocket":
			startAnotherStatusSocketWebsocket();
			break;

		case "bsplus":
			startBSPlusWebsocket();
			break;

		case "datapuller":
			startDataPullerMapInfoWebsocket();
			startDataPullerLiveDataWebsocket();
			break;

		case "sirastatus":
			startSiraStatusWebsocket();
			break;
	}
}