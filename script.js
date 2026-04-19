const NYC = {
	name: "New York City, NY",
	latitude: 40.7128,
	longitude: -74.0060,
};

const elements = {
	status: document.getElementById("status"),
	updated: document.getElementById("last-updated"),
	refreshBtn: document.getElementById("refresh-btn"),
	skinTypeFilter: document.getElementById("skin-type-filter"),
	metricsGrid: document.getElementById("metrics-grid"),
	summaryBanner: document.getElementById("summary-banner"),
	recommendations: document.getElementById("recommendations"),
};

let latestData = null;

const weatherCodeMap = {
	0: "Clear sky",
	1: "Mostly clear",
	2: "Partly cloudy",
	3: "Overcast",
	45: "Fog",
	48: "Rime fog",
	51: "Light drizzle",
	53: "Drizzle",
	55: "Heavy drizzle",
	56: "Freezing drizzle",
	57: "Heavy freezing drizzle",
	61: "Light rain",
	63: "Rain",
	65: "Heavy rain",
	66: "Freezing rain",
	67: "Heavy freezing rain",
	71: "Light snow",
	73: "Snow",
	75: "Heavy snow",
	77: "Snow grains",
	80: "Light showers",
	81: "Showers",
	82: "Violent showers",
	85: "Light snow showers",
	86: "Snow showers",
	95: "Thunderstorm",
	96: "Thunderstorm and hail",
	99: "Strong thunderstorm and hail",
};

async function fetchNYCData() {
	const weatherUrl = new URL("https://api.open-meteo.com/v1/forecast");
	weatherUrl.searchParams.set("latitude", NYC.latitude);
	weatherUrl.searchParams.set("longitude", NYC.longitude);
	weatherUrl.searchParams.set(
		"current",
		"temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m"
	);
	weatherUrl.searchParams.set("hourly", "uv_index");
	weatherUrl.searchParams.set("timezone", "auto");

	const airUrl = new URL("https://air-quality-api.open-meteo.com/v1/air-quality");
	airUrl.searchParams.set("latitude", NYC.latitude);
	airUrl.searchParams.set("longitude", NYC.longitude);
	airUrl.searchParams.set("current", "us_aqi,pm2_5");
	airUrl.searchParams.set("timezone", "auto");

	const [weatherResp, airResp] = await Promise.all([
		fetch(weatherUrl),
		fetch(airUrl),
	]);

	if (!weatherResp.ok || !airResp.ok) {
		throw new Error("Unable to fetch live weather data right now.");
	}

	const weatherData = await weatherResp.json();
	const airData = await airResp.json();

	const currentTime = weatherData.current?.time;
	const uvIndex = getUvForCurrentHour(weatherData.hourly, currentTime);

	return {
		weather: weatherData.current,
		air: airData.current,
		uvIndex,
		currentTime,
	};
}

function getUvForCurrentHour(hourly, currentTime) {
	if (!hourly || !Array.isArray(hourly.time) || !Array.isArray(hourly.uv_index)) {
		return null;
	}

	const exactMatchIndex = hourly.time.indexOf(currentTime);
	if (exactMatchIndex >= 0) {
		return hourly.uv_index[exactMatchIndex];
	}

	let closestIndex = 0;
	let smallestDiff = Infinity;

	for (let i = 0; i < hourly.time.length; i += 1) {
		const diff = Math.abs(new Date(hourly.time[i]).getTime() - new Date(currentTime).getTime());
		if (diff < smallestDiff) {
			smallestDiff = diff;
			closestIndex = i;
		}
	}

	return hourly.uv_index[closestIndex] ?? null;
}

function getAqiTag(aqi) {
	if (aqi <= 50) {
		return { label: "Good", levelClass: "good" };
	}
	if (aqi <= 100) {
		return { label: "Moderate", levelClass: "warn" };
	}
	return { label: "Unhealthy", levelClass: "bad" };
}

function weatherDescription(code) {
	return weatherCodeMap[code] || "Mixed conditions";
}

function round(value) {
	if (value == null || Number.isNaN(value)) {
		return "--";
	}
	return Math.round(value);
}

function celsiusToFahrenheit(celsius) {
	if (celsius == null || Number.isNaN(celsius)) {
		return null;
	}
	return (celsius * 9) / 5 + 32;
}

function formatSkinTypeLabel(skinType) {
	if (skinType === "all") {
		return "all skin types";
	}
	if (skinType === "acne-prone") {
		return "acne-prone skin";
	}
	return `${skinType} skin`;
}

const CSV_FALLBACK_DATA = `Brand,Product,Type,Price,Dry,Oily,Combination,Acne-prone,Sensitive
Tatcha,Dewy Skin Cream,Cream,$$$,TRUE,FALSE,FALSE,FALSE,TRUE
La Roche-Posay,Hydrating Gentle Cleanser,Cleanser,$,TRUE,FALSE,FALSE,TRUE,TRUE
Cerva,Hydrating Facial Cleanser,Cleanser,$,FALSE,FALSE,FALSE,FALSE,FALSE
Cerva,Daily Face Wash,Cleanser,$,FALSE,TRUE,TRUE,FALSE,FALSE
Ordinary,Makeup Removal,Cleanser,$,TRUE,FALSE,FALSE,FALSE,TRUE
Mixsoon,Cleansing Foam ,Cleanser,$,TRUE,TRUE,TRUE,TRUE,TRUE
Bioderma ,Sensitive cleanser ,Cleanser,$$,TRUE,TRUE,TRUE,TRUE,TRUE
Anua ,Pore Deep Cleasning Foam,Cleanser,$,FALSE,TRUE,FALSE,TRUE,TRUE
Medicube,Collegen Night Mask,Treatment,$$,FALSE,TRUE,TRUE,TRUE,TRUE
Dr. Jart+,Moisturizing Face Mask,Treatment,$,TRUE,FALSE,FALSE,FALSE,TRUE
Ordinary,Niacinamide 10% + Zinc 1%  Serum,Serum,$,FALSE,TRUE,FALSE,TRUE,FALSE
Kiehl's,Hydrating & Soothing Face Mask,Treatment,$$,TRUE,FALSE,FALSE,FALSE,FALSE
Anua,Azelaic Acid 10 Hyaluron Redness Soothing Serum,Serum,$,FALSE,FALSE,FALSE,TRUE,TRUE
Dr. Althea 345 Relief Cream,Relief Cream ,Cream,$,FALSE,TRUE,TRUE,TRUE,TRUE
Kiehl's,Alcohol-Free Toner,Toner,$$$,FALSE,TRUE,FALSE,TRUE,FALSE
Purito,Eye Cream For Brightening,Cream,$$,TRUE,FALSE,FALSE,FALSE,TRUE`;

let productCatalog = [];

async function loadProductCatalog() {
	const csvUrl = encodeURI("Skincare Spreadsheet - ORGANIZED.csv");
	try {
		const response = await fetch(csvUrl);
		if (!response.ok) {
			throw new Error(`Failed to fetch product catalog: ${response.status}`);
		}
		const csvText = await response.text();
		productCatalog = parseCsvCatalog(csvText);
	} catch (error) {
		console.warn("Product catalog unavailable:", error);
		productCatalog = parseCsvCatalog(CSV_FALLBACK_DATA);
		console.info("Loaded product catalog from built-in fallback data.");
	}
}

function parseCsvCatalog(csvText) {
	const rows = csvText
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0);

	if (rows.length < 2) {
		return [];
	}

	const headers = rows[0].split(",").map((header) => header.trim());

	return rows.slice(1).map((line) => {
		const values = line.split(",").map((value) => value.trim());
		const record = headers.reduce((acc, header, index) => {
			acc[header] = values[index] ?? "";
			return acc;
		}, {});

		return {
			brand: record.Brand,
			product: record.Product,
			type: record.Type,
			price: record.Price,
			dry: toBoolean(record.Dry),
			oily: toBoolean(record.Oily),
			combination: toBoolean(record.Combination),
			acneProne: toBoolean(record["Acne-prone"]),
			sensitive: toBoolean(record.Sensitive),
		};
	}).filter((item) => item.brand && item.product);
}

function toBoolean(value) {
	return String(value).trim().toUpperCase() === "TRUE";
}

function computeProductScore(product, criteria) {
	let score = 0;

	if (criteria.types && criteria.types.length) {
		const typeMatch = criteria.types.some(
			(type) => product.type?.toLowerCase() === type.toLowerCase()
		);
		score += typeMatch ? 2 : 0;
	}

	(criteria.skinTags || []).forEach((tag) => {
		if (product[tag]) {
			score += 1;
		}
	});

	return score;
}

function findProducts(criteria = {}, limit = 3) {
	if (!productCatalog.length) {
		return [];
	}

	const matches = productCatalog
		.map((product) => ({
			product,
			score: computeProductScore(product, criteria),
		}))
		.filter((entry) => entry.score > 0)
		.sort((a, b) => b.score - a.score);

	return matches.slice(0, limit).map((entry) => entry.product);
}

function buildRecommendations(data, skinType = "all") {
	const humidity = data.weather.relative_humidity_2m;
	const aqi = data.air.us_aqi;
	const pm25 = data.air.pm2_5;
	const uv = data.uvIndex;
	const temp = celsiusToFahrenheit(data.weather.temperature_2m);

	const items = new Map();
	const reasons = [];
	const profileReasons = [];

	function addItem(key, product) {
		items.set(key, {
			...product,
			skinTypes: product.skinTypes || ["all"],
		});
	}

	function addProductMatches(keyBase, matches, attrs, fallbackItems = []) {
		if (matches.length) {
			matches.forEach((product) => {
				const id = `${keyBase}-${product.brand}-${product.product}`
					.replace(/\s+/g, "-")
					.toLowerCase();
				addItem(id, {
					title: `${product.brand} ${product.product}`,
					tag: attrs.tag,
					levelClass: attrs.levelClass,
					note: attrs.note,
					meta: [product.type, product.price].filter(Boolean).join(" · "),
					skinTypes: attrs.skinTypes || ["all"],
				});
			});
			return;
		}

		fallbackItems.forEach((fallback, index) => {
			addItem(`${keyBase}-fallback-${index}`, fallback);
		});
	}

	if (humidity < 35) {
		reasons.push("Low humidity can pull water from your skin barrier.");
		addProductMatches(
			"dry-air",
			findProducts({
				skinTags: ["dry", "sensitive", "combination"],
				types: ["Cream", "Treatment", "Serum", "Cleanser"],
			}, 2),
			{
				tag: "Dry-Air Essential",
				levelClass: "warn",
				note: "Use a hydrating formula to avoid tightness after cleansing.",
				skinTypes: ["all"],
			},
			[
				{
					title: "Hydrating Cleanser",
					tag: "Dry-Air Essential",
					levelClass: "warn",
					note: "Use a non-foaming cleanser with glycerin to avoid tightness after washing.",
					skinTypes: ["all"],
				},
				{
					title: "Ceramide Moisturizer",
					tag: "Barrier Repair",
					levelClass: "good",
					note: "Lock in moisture with a ceramide-rich cream morning and night.",
					skinTypes: ["all"],
				},
			]
		);
	}

	if (humidity > 70) {
		reasons.push("High humidity can increase sweat and clog-prone shine.");
		addProductMatches(
			"humidity",
			findProducts({
				skinTags: ["oily", "combination"],
				types: ["Cleanser", "Serum", "Toner"],
			}, 2),
			{
				tag: "Humidity Friendly",
				levelClass: "good",
				note: "Choose a lightweight, non-comedogenic formula so skin stays balanced.",
				skinTypes: ["all"],
			},
			[
				{
					title: "Gel Moisturizer",
					tag: "Humidity Friendly",
					levelClass: "good",
					note: "Choose a lightweight, non-comedogenic gel so skin stays balanced.",
					skinTypes: ["all"],
				},
				{
					title: "Niacinamide Serum (4-10%)",
					tag: "Oil Balance",
					levelClass: "good",
					note: "Apply once daily to reduce excess oil and visible pores.",
					skinTypes: ["oily", "acne-prone"],
				},
			]
		);
	}

	if (aqi > 100 || pm25 > 35) {
		reasons.push("Elevated pollution can increase oxidative stress on skin.");
		addProductMatches(
			"pollution",
			findProducts({
				skinTags: ["sensitive", "acneProne", "combination"],
				types: ["Cleanser", "Treatment", "Serum"],
			}, 2),
			{
				tag: "Pollution Shield",
				levelClass: "bad",
				note: "Look for antioxidant-rich and cleansing support for evening routines.",
				skinTypes: ["all"],
			},
			[
				{
					title: "Antioxidant Serum",
					tag: "Pollution Shield",
					levelClass: "bad",
					note: "Use vitamin C or green tea antioxidants in the morning before sunscreen.",
					skinTypes: ["all"],
				},
				{
					title: "Evening Double Cleanse",
					tag: "Air Quality Support",
					levelClass: "warn",
					note: "Break down sunscreen and particulate buildup with a gentle second cleanse.",
					skinTypes: ["all"],
				},
			]
		);
	}

	if (uv >= 6) {
		reasons.push("UV is high, so stronger daily sun protection is needed.");
		addItem("spf50", {
			title: "Broad-Spectrum SPF 50",
			tag: "High UV",
			levelClass: "bad",
			note: "Use two finger-lengths for face and neck, then reapply every 2 hours outdoors.",
			skinTypes: ["all"],
		});
	} else if (uv >= 3) {
		reasons.push("Moderate UV still requires daily sunscreen.");
		addItem("spf30", {
			title: "Broad-Spectrum SPF 30+",
			tag: "Daily Defense",
			levelClass: "warn",
			note: "Apply every morning as your last skincare step.",
			skinTypes: ["all"],
		});
	}

	if (temp <= 41) {
		reasons.push("Cold air can increase transepidermal water loss.");
		addProductMatches(
			"cold-weather",
			findProducts({
				skinTags: ["dry", "sensitive"],
				types: ["Cream", "Treatment", "Serum"],
			}, 2),
			{
				tag: "Cold Weather",
				levelClass: "warn",
				note: "Seal in hydration at night with richer, protective formulas.",
				skinTypes: ["dry", "sensitive"],
			},
			[
				{
					title: "Occlusive Night Balm",
					tag: "Cold Weather",
					levelClass: "warn",
					note: "Seal in hydration at night with petrolatum or squalane.",
					skinTypes: ["dry", "sensitive"],
				},
			]
		);
	}

	if (temp >= 82) {
		reasons.push("Hot weather favors sweat-resistant, lightweight formulas.");
		addProductMatches(
			"heat",
			findProducts({
				skinTags: ["oily", "acneProne"],
				types: ["Cleanser", "Serum", "Toner"],
			}, 2),
			{
				tag: "Heat Friendly",
				levelClass: "good",
				note: "Swap heavy creams for lighter, more breathable textures in daytime.",
				skinTypes: ["oily", "acne-prone"],
			},
			[
				{
					title: "Lightweight Lotion",
					tag: "Heat Friendly",
					levelClass: "good",
					note: "Swap heavy creams for water-based hydration in daytime.",
					skinTypes: ["oily", "acne-prone"],
				},
			]
		);
	}

	if (skinType === "oily") {
		profileReasons.push("Oily skin benefits from lightweight, sebum-balancing textures.");
		addProductMatches(
			"oily-profile",
			findProducts({
				skinTags: ["oily"],
				types: ["Cleanser", "Serum", "Toner"],
			}, 2),
			{
				tag: "Oily Skin Focus",
				levelClass: "good",
				note: "Use oil-friendly products that keep pores clear without stripping skin.",
				skinTypes: ["oily", "acne-prone"],
			},
			[
				{
					title: "BHA Leave-On Exfoliant (0.5-2%)",
					tag: "Oily Skin Focus",
					levelClass: "good",
					note: "Use 2-4 nights weekly to keep pores clear and control shine.",
					skinTypes: ["oily", "acne-prone"],
				},
			]
		);
	}

	if (skinType === "dry") {
		profileReasons.push("Dry skin needs humectants and stronger barrier support.");
		addProductMatches(
			"dry-profile",
			findProducts({
				skinTags: ["dry"],
				types: ["Cream", "Serum", "Treatment"],
			}, 2),
			{
				tag: "Dry Skin Focus",
				levelClass: "good",
				note: "Apply to damp skin, then seal with cream to reduce dehydration.",
				skinTypes: ["dry"],
			},
			[
				{
					title: "Hyaluronic + Panthenol Serum",
					tag: "Dry Skin Focus",
					levelClass: "good",
					note: "Apply to damp skin, then seal with cream to reduce dehydration.",
					skinTypes: ["dry"],
				},
			]
		);
	}

	if (skinType === "sensitive") {
		profileReasons.push("Sensitive skin does best with calming, fragrance-free formulas.");
		addProductMatches(
			"sensitive-profile",
			findProducts({
				skinTags: ["sensitive"],
				types: ["Cream", "Treatment", "Cleanser"],
			}, 2),
			{
				tag: "Sensitive Skin Focus",
				levelClass: "good",
				note: "Choose fragrance-free formulas with calming botanicals.",
				skinTypes: ["sensitive"],
			},
			[
				{
					title: "Cica or Oat Barrier Cream",
					tag: "Sensitive Skin Focus",
					levelClass: "good",
					note: "Choose fragrance-free creams with centella, oat, or allantoin.",
					skinTypes: ["sensitive"],
				},
			]
		);
	}

	if (skinType === "acne-prone") {
		profileReasons.push("Acne-prone skin needs clear-pore support with non-comedogenic hydration.");
		addProductMatches(
			"acne-profile",
			findProducts({
				skinTags: ["acneProne"],
				types: ["Serum", "Cleanser", "Treatment"],
			}, 2),
			{
				tag: "Acne-Prone Focus",
				levelClass: "warn",
				note: "Use non-comedogenic support that helps calm breakouts and control oil.",
				skinTypes: ["acne-prone"],
			},
			[
				{
					title: "Azelaic Acid (10-15%)",
					tag: "Acne-Prone Focus",
					levelClass: "warn",
					note: "Use once daily to support clearer skin and calmer post-blemish marks.",
					skinTypes: ["acne-prone"],
				},
			]
		);
	}

	if (items.size === 0) {
		reasons.push("Current conditions are fairly balanced.");
		addItem("maintenance", {
			title: "Simple Maintenance Routine",
			tag: "Steady Conditions",
			levelClass: "good",
			note: "Keep a gentle cleanser, daily moisturizer, and SPF 30+ routine.",
			skinTypes: ["all"],
		});
	}

	const filteredProducts = Array.from(items.values()).filter((product) => {
		if (skinType === "all") {
			return true;
		}
		return product.skinTypes.includes("all") || product.skinTypes.includes(skinType);
	});

	if (filteredProducts.length === 0) {
		filteredProducts.push({
			title: "Basic Gentle Routine",
			tag: "Fallback",
			levelClass: "good",
			note: "Use a gentle cleanser, lightweight moisturizer, and broad-spectrum SPF.",
		});
	}

	const summaryBase = reasons[0] || "Conditions are fairly balanced.";
	const profileSummary =
		skinType === "all"
			? "Showing recommendations for all skin types."
			: profileReasons[0] || `Filtered for ${formatSkinTypeLabel(skinType)}.`;

	return {
		summary: `${summaryBase} ${profileSummary}`,
		products: filteredProducts,
	};
}

function renderMetrics(data) {
	const aqiTag = getAqiTag(data.air.us_aqi);

	const cards = [
		{
			label: "Temperature",
			value: `${round(celsiusToFahrenheit(data.weather.temperature_2m))}°F`,
			note: `Feels like ${round(celsiusToFahrenheit(data.weather.apparent_temperature))}°F`,
		},
		{
			label: "Humidity",
			value: `${round(data.weather.relative_humidity_2m)}%`,
			note: "Relative humidity",
		},
		{
			label: "US AQI",
			value: `${round(data.air.us_aqi)}`,
			note: `${aqiTag.label} air quality`,
		},
		{
			label: "PM2.5",
			value: `${round(data.air.pm2_5)} ug/m3`,
			note: "Fine particulate matter",
		},
		{
			label: "UV Index",
			value: `${round(data.uvIndex)}`,
			note: data.uvIndex >= 6 ? "High protection needed" : "Monitor sun exposure",
		},
		{
			label: "Wind",
			value: `${round(data.weather.wind_speed_10m)} km/h`,
			note: weatherDescription(data.weather.weather_code),
		},
	];

	elements.metricsGrid.innerHTML = cards
		.map(
			(card, index) => `
				<article class="metric-card" style="animation-delay:${index * 90}ms">
					<p class="metric-label">${card.label}</p>
					<p class="metric-value">${card.value}</p>
					<p class="metric-note">${card.note}</p>
				</article>
			`
		)
		.join("");
}

function renderRecommendations(data) {
	const selectedSkinType = elements.skinTypeFilter.value;
	const rec = buildRecommendations(data, selectedSkinType);

	elements.summaryBanner.textContent = rec.summary;

	elements.recommendations.innerHTML = rec.products
		.map(
			(product, index) => `
				<article class="rec-card" style="animation-delay:${index * 110}ms">
					<h3>${product.title}</h3>
					<p class="product-meta">${product.meta || ""}</p>
					<span class="tag ${product.levelClass}">${product.tag}</span>
					<p>${product.note}</p>
				</article>
			`
		)
		.join("");
}

function updateTimestamp(isoTime) {
	const date = new Date(isoTime);
	const formatted = new Intl.DateTimeFormat("en-US", {
		weekday: "short",
		hour: "numeric",
		minute: "2-digit",
	}).format(date);

	elements.updated.textContent = `Updated ${formatted}`;
}

function setStatus(message, isError = false) {
	elements.status.textContent = message;
	elements.status.classList.toggle("error", isError);
}

async function loadWeatherAndAdvice() {
	setStatus("Loading live weather and air quality...");
	elements.refreshBtn.disabled = true;

	try {
		// Load weather data and product catalog in parallel
		const [data] = await Promise.all([
			fetchNYCData(),
			loadProductCatalog().catch((error) => {
				console.warn("Product catalog unavailable:", error);
			}),
		]);
		
		latestData = data;
		renderMetrics(data);
		renderRecommendations(data);
		updateTimestamp(data.currentTime);
		setStatus("Data synced. Recommendations are live for current NYC conditions.");
	} catch (error) {
		console.error(error);
		setStatus("Could not load live data. Please try again in a moment.", true);
		elements.updated.textContent = "Live update unavailable";
	} finally {
		elements.refreshBtn.disabled = false;
	}
}

elements.refreshBtn.addEventListener("click", loadWeatherAndAdvice);
elements.skinTypeFilter.addEventListener("change", () => {
	if (!latestData) {
		return;
	}
	renderRecommendations(latestData);
	setStatus(`Filter applied: ${formatSkinTypeLabel(elements.skinTypeFilter.value)}.`);
});

document.addEventListener("DOMContentLoaded", () => {
	loadWeatherAndAdvice();
});
