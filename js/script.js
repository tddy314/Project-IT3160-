let map, nodes = {}, ways = [], edges = [], polylines = [];
let selectedMode = 'car', selectedNodes = [], selectionMarkers = [], currentPath = null, selectedWay = null;

const speeds = { car: 40, motorcycle: 45, walking: 5 };

const conditions = {
    clear: { color: '#22c55e', multiplier: 1, traffic: 0.1 },
    moderate: { color: '#eab308', multiplier: 0.7, traffic: 0.4 },
    jam: { color: '#a855f7', multiplier: 0.5, traffic: 0.7 },
    flooding: { color: '#ef4444', multiplier: 0.3, traffic: 0.9 }
};

const vehicleRestrictions = {
    car: ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'service'],
    motorcycle: ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'service', 'track'],
    walking: ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'service', 'track', 'footway', 'path', 'pedestrian', 'steps']
};

function initMap() {
    map = new google.maps.Map(document.getElementById('map'), {
        center: { lat: 20.9642, lng: 105.8259 },
        zoom: 14,
        mapTypeControl: true
    });
    
    map.addListener('click', (e) => handleMapClick(e.latLng));
    loadOSMData();
}

function loadOSMData() {
    fetch('pathprj.json')
        .then(response => response.json())
        .then(data => {
            processOSMData(data);
            renderMap();
            document.getElementById('loading').classList.add('hide');
        })
        .catch(error => {
            console.error('Error:', error);
            alert('Lỗi: Không tìm thấy file pathprj.json! Đảm bảo file nằm cùng thư mục với index.html');
            document.getElementById('loading').classList.add('hide');
        });
}

function processOSMData(data) {
    // Extract all nodes with coordinates
    const nodeElements = data.elements.filter(e => e.type === 'node');
    nodeElements.forEach(node => {
        nodes[node.id] = { id: node.id, lat: node.lat, lon: node.lon };
    });
    
    // Extract ways
    const wayElements = data.elements.filter(e => e.type === 'way' && e.tags && e.tags.highway);
    wayElements.forEach(way => {
        if (way.nodes && way.nodes.length >= 2) {
            ways.push({
                id: way.id,
                nodes: way.nodes,
                tags: way.tags,
                name: way.tags.name || 'Đường không tên',
                highway: way.tags.highway,
                condition: 'clear'
            });
        }
    });
    
    // Build edges from ways
    ways.forEach(way => {
        for (let i = 0; i < way.nodes.length - 1; i++) {
            const fromId = way.nodes[i];
            const toId = way.nodes[i + 1];
            const fromNode = nodes[fromId];
            const toNode = nodes[toId];
            
            if (fromNode && toNode) {
                edges.push({
                    from: fromId,
                    to: toId,
                    way: way,
                    distance: calculateDistance(fromNode.lat, fromNode.lon, toNode.lat, toNode.lon),
                    condition: 'clear'
                });
            }
        }
    });
    
    document.getElementById('nodeCount').textContent = Object.keys(nodes).length;
    document.getElementById('wayCount').textContent = ways.length;
    
    // Fit map to data bounds
    const bounds = new google.maps.LatLngBounds();
    Object.values(nodes).forEach(node => {
        bounds.extend({ lat: node.lat, lng: node.lon });
    });
    map.fitBounds(bounds);
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function heuristic(nodeId1, nodeId2) {
    const n1 = nodes[nodeId1];
    const n2 = nodes[nodeId2];
    return calculateDistance(n1.lat, n1.lon, n2.lat, n2.lon);
}

function findNearestNode(lat, lng) {
    let nearest = null;
    let minDist = Infinity;
    
    Object.values(nodes).forEach(node => {
        const dist = calculateDistance(lat, lng, node.lat, node.lon);
        if (dist < minDist) {
            minDist = dist;
            nearest = node;
        }
    });
    
    return nearest;
}

function canUseRoad(highway, mode) {
    return vehicleRestrictions[mode].includes(highway);
}

function handleMapClick(latLng) {
    if (selectedNodes.length >= 2) return;
    
    const lat = latLng.lat(), lng = latLng.lng();
    const nearestNode = findNearestNode(lat, lng);
    if (!nearestNode) return;
    
    selectedNodes.push(nearestNode);
    
    const marker = new google.maps.Marker({
        position: { lat: nearestNode.lat, lng: nearestNode.lon },
        map: map,
        icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 10,
            fillColor: selectedNodes.length === 1 ? '#10b981' : '#ef4444',
            fillOpacity: 1,
            strokeColor: 'white',
            strokeWeight: 3
        },
        label: { text: selectedNodes.length === 1 ? 'A' : 'B', color: 'white', fontWeight: 'bold', fontSize: '14px' }
    });
    
    selectionMarkers.push(marker);
    document.getElementById('selectedCount').textContent = `${selectedNodes.length}/2`;
    
    if (selectedNodes.length === 2) findPath();
}

function renderMap() {
    clearMap();
    
    // Draw all ways (background roads)
    ways.forEach(way => {
        const path = [];
        way.nodes.forEach(nodeId => {
            const node = nodes[nodeId];
            if (node) path.push({ lat: node.lat, lng: node.lon });
        });
        
        if (path.length < 2) return;
        
        const polyline = new google.maps.Polyline({
            path: path,
            strokeColor: conditions[way.condition].color,
            strokeOpacity: 0.6,
            strokeWeight: 3,
            map: map
        });
        
        polyline.wayData = way;
        
        polyline.addListener('click', (e) => {
            e.stop();
            selectedWay = way;
            document.getElementById('streetName').textContent = way.name;
            document.getElementById('edgeModal').classList.add('show');
        });
        
        polylines.push(polyline);
    });
    
    // Draw the selected path on top (only the specific edges used)
    if (currentPath && currentPath.edges) {
        currentPath.edges.forEach(edge => {
            const fromNode = nodes[edge.from];
            const toNode = nodes[edge.to];
            if (fromNode && toNode) {
                const pathPolyline = new google.maps.Polyline({
                    path: [
                        { lat: fromNode.lat, lng: fromNode.lon },
                        { lat: toNode.lat, lng: toNode.lon }
                    ],
                    strokeColor: '#3b82f6',
                    strokeOpacity: 1,
                    strokeWeight: 6,
                    map: map,
                    zIndex: 1000
                });
                polylines.push(pathPolyline);
            }
        });
    }
}

function clearMap() {
    polylines.forEach(p => p.setMap(null));
    polylines = [];
}

function findPath() {
    const result = aStarSearch(selectedNodes[0].id, selectedNodes[1].id);
    if (result) {
        currentPath = result;
        document.getElementById('resultDistance').textContent = result.distance.toFixed(2);
        document.getElementById('resultTime').textContent = result.time.toFixed(1);
        
        // Display street names
        const streetList = document.getElementById('streetList');
        streetList.innerHTML = '';
        const uniqueWays = [...new Set(result.ways.map(w => w.name))];
        uniqueWays.forEach(name => {
            const div = document.createElement('div');
            div.className = 'street-item';
            div.textContent = `🛣️ ${name}`;
            streetList.appendChild(div);
        });
        
        document.getElementById('resultBox').style.display = 'block';
        renderMap();
    } else {
        alert('Không tìm thấy đường đi! Thử chọn điểm khác hoặc đổi phương tiện.');
        clearSelection();
    }
}

function aStarSearch(startId, goalId) {
    const openSet = new Set([startId]);
    const cameFrom = {};
    const gScore = {};
    const fScore = {};
    
    Object.keys(nodes).forEach(id => {
        gScore[id] = Infinity;
        fScore[id] = Infinity;
    });
    
    gScore[startId] = 0;
    fScore[startId] = heuristic(startId, goalId);
    
    while (openSet.size > 0) {
        let current = null;
        let minF = Infinity;
        openSet.forEach(id => {
            if (fScore[id] < minF) {
                minF = fScore[id];
                current = id;
            }
        });
        
        if (current === goalId) {
            return reconstructPath(cameFrom, current, gScore[goalId]);
        }
        
        openSet.delete(current);
        
        const neighbors = edges.filter(e => 
            (e.from == current || e.to == current) && 
            canUseRoad(e.way.highway, selectedMode)
        );
        
        neighbors.forEach(edge => {
            const neighbor = edge.from == current ? edge.to : edge.from;
            const cond = conditions[edge.condition];
            const effectiveSpeed = speeds[selectedMode] * cond.multiplier * (1 - cond.traffic * 0.5);
            const travelTime = (edge.distance / effectiveSpeed) * 60;
            
            const tentativeG = gScore[current] + travelTime;
            
            if (tentativeG < gScore[neighbor]) {
                cameFrom[neighbor] = { node: current, edge: edge };
                gScore[neighbor] = tentativeG;
                fScore[neighbor] = gScore[neighbor] + heuristic(neighbor, goalId);
                openSet.add(neighbor);
            }
        });
    }
    
    return null;
}

function reconstructPath(cameFrom, current, totalTime) {
    const pathNodes = [current];
    const pathEdges = [];
    const pathWays = [];
    let totalDistance = 0;
    
    while (cameFrom[current]) {
        const prev = cameFrom[current];
        pathNodes.unshift(prev.node);
        pathEdges.unshift(prev.edge);
        pathWays.unshift(prev.edge.way);
        totalDistance += prev.edge.distance;
        current = prev.node;
    }
    
    return { nodes: pathNodes, edges: pathEdges, ways: pathWays, distance: totalDistance, time: totalTime };
}

function clearSelection() {
    selectedNodes = [];
    selectionMarkers.forEach(m => m.setMap(null));
    selectionMarkers = [];
    currentPath = null;
    document.getElementById('selectedCount').textContent = '0/2';
    document.getElementById('resultBox').style.display = 'none';
    renderMap();
}

document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        selectedMode = this.dataset.mode;
        if (selectedNodes.length === 2) findPath();
    });
});

document.getElementById('clearBtn').addEventListener('click', clearSelection);

document.querySelectorAll('.condition-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        if (selectedWay) {
            selectedWay.condition = this.dataset.condition;
            // Update all edges that belong to this way
            edges.forEach(edge => {
                if (edge.way.id === selectedWay.id) {
                    edge.condition = this.dataset.condition;
                }
            });
            renderMap();
            if (selectedNodes.length === 2) findPath();
            document.getElementById('edgeModal').classList.remove('show');
        }
    });
});

document.getElementById('closeModal').addEventListener('click', () => {
    document.getElementById('edgeModal').classList.remove('show');
});

// Easter egg
const konamiCode = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
let konamiIndex = 0;
document.addEventListener('keydown', (e) => {
    if (e.key === konamiCode[konamiIndex]) {
        konamiIndex++;
        if (konamiIndex === konamiCode.length) {
            document.getElementById('easterEgg').classList.add('show');
            setTimeout(() => document.getElementById('easterEgg').classList.remove('show'), 3000);
            konamiIndex = 0;
        }
    } else konamiIndex = 0;
});