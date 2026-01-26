/**
 * Static Random Pic API client logic
 * Generated at 2026-01-26T10:05:52.239Z
 */
(function() {
    var counts = { h: 14, v: 14 };
    var domain = '';
    
    // Normalize domain
    if (domain && domain.endsWith('/')) domain = domain.slice(0, -1);

    var sessionRandomH = null;
    var sessionRandomV = null;

    function getRandomUrl(type) {
        if (!counts[type] || counts[type] === 0) return '';
        
        if (type === 'h' && sessionRandomH) return sessionRandomH;
        if (type === 'v' && sessionRandomV) return sessionRandomV;

        // 0-based index
        var num = Math.floor(Math.random() * counts[type]); 
        var url = (domain ? domain + '/' : '') + type + '/' + num + '.webp';

        if (type === 'h') sessionRandomH = url;
        if (type === 'v') sessionRandomV = url;

        return url;
    }

    window.getRandomPicH = function() { return getRandomUrl('h'); };
    window.getRandomPicV = function() { return getRandomUrl('v'); };

    function setRandomBackground() { 
         const bgBox = document.getElementById('bg-box'); 
         if (bgBox) { 
             const bgUrl = getRandomUrl('h');
             if (!bgUrl) return;
             
             const img = new Image(); 
             img.onload = function() { 
                 bgBox.style.backgroundImage = 'url("' + bgUrl + '")'; 
                 bgBox.classList.add('loaded'); 
             }; 
             img.src = bgUrl; 
         }
         initGenericBackgrounds();
    }

    function initImgTags() {
        var imgTags = document.getElementsByTagName('img');
        for (var i = 0; i < imgTags.length; i++) {
            var img = imgTags[i];
            var alt = img.getAttribute('alt');
            var src = img.getAttribute('src');

            if (alt === 'random:h' || (src && src.indexOf('/random/h') !== -1)) {
                img.src = getRandomUrl('h');
            } else if (alt === 'random:v' || (src && src.indexOf('/random/v') !== -1)) {
                img.src = getRandomUrl('v');
            }
        }
    }

    function initGenericBackgrounds() {
        var bgElements = document.querySelectorAll('[data-random-bg]');
        bgElements.forEach(function(el) {
            if (el.id === 'bg-box') return; 
            var type = el.getAttribute('data-random-bg');
            if (type === 'h' || type === 'v') {
                var url = getRandomUrl(type);
                if (url) {
                    var img = new Image();
                    img.onload = function() {
                        el.style.backgroundImage = 'url("' + url + '")';
                        el.classList.add('loaded');
                    };
                    img.src = url;
                }
            }
        });
    }

    function init() {
        setRandomBackground();
        initImgTags();
    }
  
    if (document.readyState === 'loading') { 
        document.addEventListener('DOMContentLoaded', init); 
    } else { 
        init(); 
    } 
})();