const NYC = {
	name: "New York City, NY",
	latitude: 40.7128,
	longitude: -74.0060,
};

const elements = {
	status: document.getElementById("status"),
	updated: document.getElementById("last-updated"),
	refreshBtn: document.getElementById("refresh-btn"),
	metricsGrid: document.getElementById("metrics-grid"),
	summaryBanner: document.getElementById("summary-banner"),
	recommendations: document.getElementById("recommendations"),
};

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

function buildRecommendations(data) {
	const humidity = data.weather.relative_humidity_2m;
	const aqi = data.air.us_aqi;
	const pm25 = data.air.pm2_5;
	const uv = data.uvIndex;
	const temp = data.weather.temperature_2m;

	const items = new Map();
	const reasons = [];

	if (humidity < 35) {
		reasons.push("Low humidity can pull water from your skin barrier.");
		items.set("hydrating-cleanser", {
			title: "Hydrating Cleanser",
			tag: "Dry-Air Essential",
			levelClass: "warn",
			note: "Use a non-foaming cleanser with glycerin to avoid tightness after washing.",
		});
		items.set("ceramide-cream", {
			title: "Ceramide Moisturizer",
			tag: "Barrier Repair",
			levelClass: "good",
			note: "Lock in moisture with a ceramide-rich cream morning and night.",
		});
	}

	if (humidity > 70) {
		reasons.push("High humidity can increase sweat and clog-prone shine.");
		items.set("gel-moisturizer", {
			title: "Gel Moisturizer",
			tag: "Humidity Friendly",
			levelClass: "good",
			note: "Choose a lightweight, non-comedogenic gel so skin stays balanced.",
		});
		items.set("niacinamide", {
			title: "Niacinamide Serum (4-10%)",
			tag: "Oil Balance",
			levelClass: "good",
			note: "Apply once daily to reduce excess oil and visible pores.",
		});
	}

	if (aqi > 100 || pm25 > 35) {
		reasons.push("Elevated pollution can increase oxidative stress on skin.");
		items.set("antioxidant", {
			title: "Antioxidant Serum",
			tag: "Pollution Shield",
			levelClass: "bad",
			note: "Use vitamin C or green tea antioxidants in the morning before sunscreen.",
		});
		items.set("double-cleanse", {
			title: "Evening Double Cleanse",
			tag: "Air Quality Support",
			levelClass: "warn",
			note: "Break down sunscreen and particulate buildup with an oil cleanse first.",
		});
	}

	if (uv >= 6) {
		reasons.push("UV is high, so stronger daily sun protection is needed.");
		items.set("spf50", {
			title: "Broad-Spectrum SPF 50",
			tag: "High UV",
			levelClass: "bad",
			note: "Use two finger-lengths for face and neck, then reapply every 2 hours outdoors.",
		});
	} else if (uv >= 3) {
		reasons.push("Moderate UV still requires daily sunscreen.");
		items.set("spf30", {
			title: "Broad-Spectrum SPF 30+",
			tag: "Daily Defense",
			levelClass: "warn",
			note: "Apply every morning as your last skincare step.",
		});
	}

	if (temp <= 5) {
		reasons.push("Cold air can increase transepidermal water loss.");
		items.set("occlusive", {
			title: "Occlusive Night Balm",
			tag: "Cold Weather",
			levelClass: "warn",
			note: "Seal in hydration at night with petrolatum or squalane.",
		});
	}

	if (temp >= 28) {
		reasons.push("Hot weather favors sweat-resistant, lightweight formulas.");
		items.set("light-lotion", {
			title: "Lightweight Lotion",
			tag: "Heat Friendly",
			levelClass: "good",
			note: "Swap heavy creams for water-based hydration in daytime.",
		});
	}

	if (items.size === 0) {
		reasons.push("Current conditions are fairly balanced.");
		items.set("maintenance", {
			title: "Simple Maintenance Routine",
			tag: "Steady Conditions",
			levelClass: "good",
			note: "Keep a gentle cleanser, daily moisturizer, and SPF 30+ routine.",
		});
	}

	return {
		summary: reasons[0],
		products: Array.from(items.values()),
	};
}

function renderMetrics(data) {
	const aqiTag = getAqiTag(data.air.us_aqi);

	const cards = [
		{
			label: "Temperature",
			value: `${round(data.weather.temperature_2m)}°C`,
			note: `Feels like ${round(data.weather.apparent_temperature)}°C`,
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
	const rec = buildRecommendations(data);

	elements.summaryBanner.textContent = rec.summary;

	elements.recommendations.innerHTML = rec.products
		.map(
			(product, index) => `
				<article class="rec-card" style="animation-delay:${index * 110}ms">
					<h3>${product.title}</h3>
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
		const data = await fetchNYCData();
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

loadWeatherAndAdvice();
