(function(){

        const SEARCH_URL_GOOGLE_MAPS = "https://www.google.com/maps/place/";

        function createNewDiv(id, text) {
            var newDiv = document.createElement("div");
            var newTextNode = document.createTextNode(text);
            newDiv.id = id;
            newDiv.insertBefore(newTextNode, null);
            return newDiv;
        }

        // If this is the first time Axon is going to start Google Maps
        // check if the website is not already using Google Maps.
        if (axonData.isFirstTime) {

            var data = {};
            data.isGoogleMapsInUseByWebsite = false;

            if (typeof(google)==="object" &&
                typeof(google.maps)==="object")
            {
                data.isGoogleMapsInUseByWebsite = true;
            }

            var newDiv = createNewDiv(axonData.uniqueString, JSON.stringify(data));
            newDiv.style.display = "none";

            // Add Google Maps in use indicator div, because add-on listeners.js
            // only has access to the DOM, not the original window object.
            document.getElementsByTagName('body')[0].appendChild(newDiv);
        }
            
        var indicatorDiv = document.getElementById(axonData.uniqueString);
        var indicator = JSON.parse(indicatorDiv.innerHTML);

        if (indicator.isGoogleMapsInUseByWebsite===false) {

            var axonMapCanvasContainerElement = document.getElementById('axon-map-canvas-container');
            var newDiv = createNewDiv("axon-map-canvas", "");
            axonMapCanvasContainerElement.insertBefore(newDiv, null);

            newScriptElement = document.createElement('script');
            newScriptElement.id = "axonStartGoogleMapsScript";
            newScriptElement.src = 'https://maps.googleapis.com/maps/api/js?v=3.exp&signed_in=true&callback=initializeGoogleMaps';
            document.getElementsByTagName('head')[0].appendChild(newScriptElement);

            function emptyElement(element) {
                while ( element.firstChild ) {
                    element.removeChild( element.firstChild );
                }
            }

            function insertTextIntoElement(text, intoElement) {
                var newTextNode = document.createTextNode(text);
                emptyElement(intoElement);
                intoElement.insertBefore(newTextNode, null);
            }

            window.initializeGoogleMaps = function() {

                // window.axonData is appended to this file before its insertion
                // into the head tag in listeners.js::googleMapsGeocodeListener.
                var mapOptions = { zoom: axonData.zoomLevelBubble };
                var mapElement = document.getElementById('axon-map-canvas');
                var map = new google.maps.Map(mapElement, mapOptions);

                mapElement.className=""; // Remove displayNone
                google.maps.event.trigger(map, 'resize');
                map.setCenter(axonData.coordinates);

                var marker = new google.maps.Marker({
                    map: map,
                    position: axonData.coordinates
                });

                // Set anchor in lower right corner to Google Maps
                google.maps.event.addListenerOnce(map, 'idle', function() {
                    var x = mapElement.firstChild.firstChild;
                    while (x!==null) {
                        if (x.className.indexOf("gm-style-cc")!==-1) break;
                        x = x.nextSibling;
                    }
                    if (x!==null) {
                        x.firstChild.style.opacity=1; // background color
                        var anchorElement = x.firstChild.nextSibling.firstChild;
                        insertTextIntoElement("Open in new tab", anchorElement);
                        var link = SEARCH_URL_GOOGLE_MAPS+
                                   axonData.addressLongName+
                                   '/@'+axonData.coordinates.lat+','+axonData.coordinates.lng+','+axonData.zoomLevelMaps+'z';
                        anchorElement.setAttribute('href', link);
                    }
                });
            }
        }
})();

