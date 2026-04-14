// --- DYNAMICALLY LOAD GOOGLE MAPS ---
function loadGoogleMaps() {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${CONFIG.GOOGLE_MAPS_API_KEY}&libraries=places&callback=initMap`;
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
}

// --- GLOBAL VARIABLES ---
let map;
let markers = [];
let currentPlaceData = null; 
let activeSearchMarker = null; 
let globalInfoWindow; 
let currentReviewIndex = null; // Tracks which review we are editing

const breadIconURL = `data:image/svg+xml;utf-8,<svg xmlns="http://www.w3.org/2000/svg" width="35" height="35"><text x="0" y="28" font-size="28">🥖</text></svg>`;

// --- UI NAVIGATION LOGIC ---
function showHome() {
    document.getElementById('homeView').classList.add('active');
    document.getElementById('formView').classList.remove('active');
    document.getElementById('detailView').classList.remove('active');
    document.getElementById('cafeSearch').value = ''; 
    currentPlaceData = null;
    currentReviewIndex = null; // Reset index when going home
}

function cancelReview() {
    if (activeSearchMarker) activeSearchMarker.setMap(null); 
    showHome();
    map.setZoom(13); 
}

function closeDetail() {
    globalInfoWindow.close(); 
    showHome();
    map.setZoom(13);
}

// Opens form for a BRAND NEW place
function showForm(placeData) {
    currentReviewIndex = null; // Ensure we aren't editing an old one
    document.getElementById('homeView').classList.remove('active');
    document.getElementById('formView').classList.add('active');
    document.getElementById('detailView').classList.remove('active');
    
    document.getElementById('formCafeName').innerText = placeData.name;
    document.getElementById('reviewDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('formGoogleRating').innerText = `🌍 Google Rating: ${placeData.googleRating} / 5`;
    
    const photoGallery = document.getElementById('formPhotos');
    photoGallery.innerHTML = '';
    if (placeData.photos && placeData.photos.length > 0) {
        placeData.photos.forEach(url => photoGallery.innerHTML += `<img src="${url}" alt="Cafe photo">`);
    } else {
        photoGallery.innerHTML = '<span style="font-size: 0.8em; color: #888;">No photos available</span>';
    }
    
    categories.forEach(cat => {
        document.getElementById(`${cat.id}-p1`).value = '';
        document.getElementById(`${cat.id}-p2`).value = '';
        document.getElementById(`${cat.id}-weight`).value = '3';
        updateSliderLabel(cat.id);
    });
    document.getElementById('hadCoffee').checked = false;
    toggleCoffee();
}

function showDetail(review, index) {
    currentReviewIndex = index; // Save the index so we know which one to edit/delete
    
    document.getElementById('homeView').classList.remove('active');
    document.getElementById('formView').classList.remove('active');
    document.getElementById('detailView').classList.add('active');
    
    document.getElementById('detailName').innerText = review.cafe;
    
    const dateObj = new Date(review.date);
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('detailDate').innerText = dateObj.toLocaleDateString(undefined, options);
    
    document.getElementById('detailScore').innerText = review.score;
    document.getElementById('detailComparison').innerText = `🌍 Google Users gave it: ${review.googleRating || 'N/A'}/5`;

    const detailPhotos = document.getElementById('detailPhotos');
    detailPhotos.innerHTML = '';
    if (review.photos && review.photos.length > 0) {
        review.photos.forEach(url => detailPhotos.innerHTML += `<img src="${url}" alt="Cafe photo">`);
    } else {
        detailPhotos.innerHTML = '<span style="font-size: 0.8em; color: #888;">No photos saved for this trip.</span>';
    }
}

// --- EDIT & DELETE LOGIC ---
function deleteReview() {
    if(confirm("Are you sure you want to delete this review? 🥺")) {
        let history = JSON.parse(localStorage.getItem('bmoHistory')) || [];
        history.splice(currentReviewIndex, 1); // Remove from array
        localStorage.setItem('bmoHistory', JSON.stringify(history));
        closeDetail();
        renderHistoryAndPins();
    }
}

function openEditForm() {
    const history = JSON.parse(localStorage.getItem('bmoHistory')) || [];
    const review = history[currentReviewIndex];
    
    // Set the place data so save works correctly
    currentPlaceData = {
        name: review.cafe,
        lat: review.lat,
        lng: review.lng,
        googleRating: review.googleRating,
        photos: review.photos
    };
    
    // Switch views
    document.getElementById('homeView').classList.remove('active');
    document.getElementById('detailView').classList.remove('active');
    document.getElementById('formView').classList.add('active');
    
    // Repopulate headers
    document.getElementById('formCafeName').innerText = review.cafe;
    document.getElementById('reviewDate').value = review.date;
    document.getElementById('formGoogleRating').innerText = `🌍 Google Rating: ${review.googleRating || 'N/A'} / 5`;
    
    const photoGallery = document.getElementById('formPhotos');
    photoGallery.innerHTML = '';
    if (review.photos && review.photos.length > 0) {
        review.photos.forEach(url => photoGallery.innerHTML += `<img src="${url}" alt="Cafe photo">`);
    }
    
    // Repopulate old scores
    const hadCoffee = review.rawScores && review.rawScores['coffee'];
    document.getElementById('hadCoffee').checked = !!hadCoffee;
    toggleCoffee();
    
    categories.forEach(cat => {
        if (review.rawScores && review.rawScores[cat.id]) {
            document.getElementById(`${cat.id}-p1`).value = review.rawScores[cat.id].p1;
            document.getElementById(`${cat.id}-p2`).value = review.rawScores[cat.id].p2;
            document.getElementById(`${cat.id}-weight`).value = review.rawScores[cat.id].weight;
        } else {
            // Fallback for old reviews created before the edit feature existed
            document.getElementById(`${cat.id}-p1`).value = '';
            document.getElementById(`${cat.id}-p2`).value = '';
            document.getElementById(`${cat.id}-weight`).value = '3';
        }
        updateSliderLabel(cat.id);
    });
}

// --- FORM GENERATION LOGIC ---
const categories = [
    { id: 'bread', icon: '🥖', name: 'The Bread' },
    { id: 'cheese', icon: '🧀', name: 'The Cheese' },
    { id: 'place', icon: '🪴', name: 'The Place / Vibe' },
    { id: 'price', icon: '💸', name: 'Price / Value' },
    { id: 'coffee', icon: '☕', name: 'The Coffee', hiddenAtStart: true }
];

document.addEventListener("DOMContentLoaded", () => {
    const container = document.getElementById('categoriesContainer');
    categories.forEach(cat => {
        const div = document.createElement('div');
        div.className = 'category-card';
        div.id = `card-${cat.id}`;
        if (cat.hiddenAtStart) div.style.display = 'none';

        div.innerHTML = `
            <div class="category-header"><span>${cat.icon} ${cat.name}</span></div>
            <div class="rating-row">
                <div class="rating-input"><label>Your Score</label><input type="number" id="${cat.id}-p1" min="1" max="10"></div>
                <div class="rating-input"><label>Partner Score</label><input type="number" id="${cat.id}-p2" min="1" max="10"></div>
            </div>
            <div class="slider-group">
                <label>Weight: <span id="${cat.id}-weight-val">Normal</span></label>
                <input type="range" id="${cat.id}-weight" min="1" max="5" value="3" oninput="updateSliderLabel('${cat.id}')">
            </div>
        `;
        container.appendChild(div);
    });
    
    loadGoogleMaps();
});

function updateSliderLabel(id) {
    const val = document.getElementById(`${id}-weight`).value;
    const labels = ["Don't Care", "Slightly", "Normal", "Important", "Crucial!"];
    document.getElementById(`${id}-weight-val`).innerText = labels[val - 1];
}

function toggleCoffee() {
    document.getElementById('card-coffee').style.display = document.getElementById('hadCoffee').checked ? 'block' : 'none';
}

// --- MAP & INIT LOGIC ---
window.initMap = function() {
    const copenhagen = { lat: 55.6761, lng: 12.5683 };
    
    map = new google.maps.Map(document.getElementById("map"), {
        zoom: 13,
        center: copenhagen,
        mapId: "DEMO_MAP_ID",
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false
    });

    globalInfoWindow = new google.maps.InfoWindow();
    const input = document.getElementById("cafeSearch");
    const autocomplete = new google.maps.places.Autocomplete(input);
    autocomplete.bindTo("bounds", map);
    autocomplete.setFields(["geometry", "name", "rating", "photos"]);

    autocomplete.addListener("place_changed", () => {
        globalInfoWindow.close();
        const place = autocomplete.getPlace();
        if (!place.geometry || !place.geometry.location) return;

        let extractedPhotos = [];
        if (place.photos) {
            extractedPhotos = place.photos.slice(0, 10).map(photo => photo.getUrl({maxWidth: 400}));
        }

        currentPlaceData = {
            name: place.name,
            lat: place.geometry.location.lat(),
            lng: place.geometry.location.lng(),
            googleRating: place.rating || "N/A",
            photos: extractedPhotos
        };

        map.setCenter(place.geometry.location);
        map.setZoom(16);
        
        if (activeSearchMarker) activeSearchMarker.setMap(null);
        activeSearchMarker = new google.maps.Marker({
            map: map,
            position: place.geometry.location,
            animation: google.maps.Animation.DROP,
            icon: breadIconURL
        });

        showForm(currentPlaceData);
    });

    renderHistoryAndPins();
};

function calculateAndSave() {
    if (!currentPlaceData) return;

    let sumWeighted = 0, sumWeights = 0;
    const hadCoffee = document.getElementById('hadCoffee').checked;
    const selectedDate = document.getElementById('reviewDate').value; 
    
    const rawScores = {}; // We must save the raw scores to edit them later!

    categories.forEach(cat => {
        if (cat.id === 'coffee' && !hadCoffee) return;
        const p1 = parseFloat(document.getElementById(`${cat.id}-p1`).value) || 0;
        const p2 = parseFloat(document.getElementById(`${cat.id}-p2`).value) || 0;
        const weight = parseFloat(document.getElementById(`${cat.id}-weight`).value) || 3;
        
        rawScores[cat.id] = { p1, p2, weight }; // Save individual choices
        
        const catAvg = (p1 + p2) / 2;
        sumWeighted += (catAvg * weight);
        sumWeights += weight;
    });

    const finalWeighted = (sumWeights > 0) ? (sumWeighted / sumWeights).toFixed(1) : 0;

    const review = { 
        cafe: currentPlaceData.name, 
        lat: currentPlaceData.lat,
        lng: currentPlaceData.lng,
        date: selectedDate, 
        score: finalWeighted,
        googleRating: currentPlaceData.googleRating, 
        photos: currentPlaceData.photos,
        rawScores: rawScores 
    };

    let history = JSON.parse(localStorage.getItem('bmoHistory')) || [];
    
    // Check if we are updating or adding a new one
    if (currentReviewIndex !== null) {
        history[currentReviewIndex] = review;
    } else {
        history.unshift(review);
    }
    
    history.sort((a, b) => new Date(b.date) - new Date(a.date));
    localStorage.setItem('bmoHistory', JSON.stringify(history));
    
    if (activeSearchMarker) activeSearchMarker.setMap(null);

    renderHistoryAndPins();
    showHome();
    map.setZoom(14);
}

function renderHistoryAndPins() {
    const history = JSON.parse(localStorage.getItem('bmoHistory')) || [];
    const list = document.getElementById('historyList');
    list.innerHTML = '';
    
    markers.forEach(marker => marker.setMap(null));
    markers = [];

    history.forEach((item, index) => { // We added 'index' here
        const div = document.createElement('div');
        div.className = 'history-item';
        const dateStr = new Date(item.date).toLocaleDateString();
        
        div.innerHTML = `
            <strong>${item.cafe}</strong> <br>
            <span style="color: var(--secondary); font-size: 0.9em;">${dateStr}</span> <br>
            ✨ <strong>Score: ${item.score}/10</strong>
        `;
        
        let currentMarker = null;

        if (item.lat && item.lng && map) {
            currentMarker = new google.maps.Marker({
                position: { lat: item.lat, lng: item.lng },
                map: map,
                title: item.cafe,
                animation: google.maps.Animation.DROP,
                icon: breadIconURL 
            });
            
            currentMarker.addListener("click", () => {
                showDetail(item, index); // Pass the index to showDetail
                map.setCenter(currentMarker.getPosition());
                globalInfoWindow.setContent(`<div style="font-family:'Quicksand'; padding:5px; text-align:center;"><strong>${item.cafe}</strong><br>Our ⭐: ${item.score} | Google ⭐: ${item.googleRating || 'N/A'}</div>`);
                globalInfoWindow.open(map, currentMarker);
            });

            markers.push(currentMarker);
        }

        div.onclick = () => {
            showDetail(item, index); // Pass the index to showDetail
            if (item.lat && item.lng && currentMarker) {
                map.setCenter({lat: item.lat, lng: item.lng});
                map.setZoom(16);
                globalInfoWindow.setContent(`<div style="font-family:'Quicksand'; padding:5px; text-align:center;"><strong>${item.cafe}</strong><br>Our ⭐: ${item.score} | Google ⭐: ${item.googleRating || 'N/A'}</div>`);
                globalInfoWindow.open(map, currentMarker);
            }
        };
        
        list.appendChild(div);
    });
}