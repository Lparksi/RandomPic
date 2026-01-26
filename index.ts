import { readdir, mkdir, stat, rm, copyFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, extname, dirname } from 'path';
import sharp from 'sharp';

const SOURCE_DIR = 'pics';
const DEST_DIR = 'dest';
const VALID_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.tiff'];
const DOMAIN = process.env.DOMAIN || ''; // Allow setting domain via env

interface Manifest {
    h: number;
    v: number;
    generated_at: string;
}

// Fisher-Yates Shuffle
function shuffle<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

async function ensureDir(dir: string) {
    try {
        await mkdir(dir, { recursive: true });
    } catch (err) {
        if ((err as any).code !== 'EEXIST') throw err;
    }
}

async function processImages(type: 'h' | 'v') {
    const inputDir = join(SOURCE_DIR, type);
    const outputDir = join(DEST_DIR, type);

    // Ensure output directory exists
    await ensureDir(outputDir);

    // Read files from input directory
    let files: string[] = [];
    try {
        const entries = await readdir(inputDir);
        files = entries.filter(file =>
            VALID_EXTENSIONS.includes(extname(file).toLowerCase())
        );
        // Shuffle the files for random order in functionality
        files = shuffle(files);

    } catch (error) {
        console.warn(`Warning: Could not read directory ${inputDir}:`, error);
        return 0;
    }

    if (files.length === 0) {
        console.log(`No images found in ${inputDir}`);
        return 0;
    }

    console.log(`Found ${files.length} images in ${type}...`);

    // Process each image
    // Using 0-based indexing as originally requested
    const tasks = files.map(async (file, index) => {
        const inputPath = join(inputDir, file);
        const outputPath = join(outputDir, `${index}.webp`);

        try {
            await sharp(inputPath)
                .webp({ quality: 80 })
                .toFile(outputPath);
        } catch (error) {
            console.error(`Error processing ${inputPath}:`, error);
        }
    });

    await Promise.all(tasks);
    return files.length;
}

async function copyLibs() {
    const libDir = join(DEST_DIR, 'lib');
    await ensureDir(libDir);

    const libs = [
        { name: 'masonry.pkgd.min.js', pkg: 'masonry-layout', path: 'dist/masonry.pkgd.min.js' },
        { name: 'imagesloaded.pkgd.min.js', pkg: 'imagesloaded', path: 'imagesloaded.pkgd.min.js' },
        { name: 'lozad.min.js', pkg: 'lozad', path: 'dist/lozad.min.js' }
    ];

    for (const lib of libs) {
        // Attempt to find in node_modules
        try {
            // Simple resolution attempt 
            const nodeModulesPath = join('node_modules', lib.pkg, lib.path);
            if (existsSync(nodeModulesPath)) {
                await copyFile(nodeModulesPath, join(libDir, lib.name));
            } else {
                console.warn(`Library not found: ${nodeModulesPath}`);
            }
        } catch (e) {
            console.warn(`Failed to copy library ${lib.name}`, e);
        }
    }
}

async function generateClientJS(manifest: Manifest) {
    const jsContent = `
/**
 * Static Random Pic API client logic
 * Generated at ${manifest.generated_at}
 */
(function() {
    var counts = { h: ${manifest.h}, v: ${manifest.v} };
    var domain = '${DOMAIN}';
    
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
    `;
    await Bun.write(join(DEST_DIR, 'random.js'), jsContent.trim());
}

async function generateGalleryHtml(manifest: Manifest) {
    const types = ['h', 'v'] as const;
    let gallerySections = '';

    let navButtons = `<button class="filter-btn active" onclick="filterGallery('all')">All</button>`;

    for (const type of types) {
        const count = manifest[type];
        if (count === 0) continue;

        navButtons += `<button class="filter-btn" onclick="filterGallery('${type}')">${type.toUpperCase()}</button>`;

        let itemsHtml = '';
        for (let i = 0; i < count; i++) {
            const url = (DOMAIN ? `${DOMAIN}/` : '') + `${type}/${i}.webp`;
            itemsHtml += `<div class="grid-item"><img class="lozad" data-src="${url}" alt="${type}-${i}"></div>\n`;
        }

        gallerySections += `
        <section id="section-${type}" class="gallery-section">
            <h2>Category: ${type.toUpperCase()}</h2>
            <div class="grid" id="grid-${type}">
                <div class="grid-sizer"></div>
                ${itemsHtml}
            </div>
        </section>
        `;
    }

    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>RandomPic Gallery</title>
    <style>
        body { font-family: -apple-system, system-ui, sans-serif; margin: 0; padding: 20px; background: #f4f4f5; }
        h1 { text-align: center; color: #18181b; }
        .filter-nav { text-align: center; margin: 2rem 0; }
        .filter-btn {
            background: #fff; border: 1px solid #e4e4e7; padding: 0.5rem 1rem; margin: 0 0.25rem;
            border-radius: 0.5rem; cursor: pointer; transition: all 0.2s; color: #52525b; font-weight: 500;
        }
        .filter-btn:hover { background: #fafafa; border-color: #d4d4d8; }
        .filter-btn.active { background: #2563eb; color: white; border-color: #2563eb; }
        
        .gallery-section h2 { color: #3f3f46; border-bottom: 2px solid #e4e4e7; padding-bottom: 0.5rem; font-size: 1.25rem; }
        
        .grid { margin: 0 auto; }
        .grid-sizer, .grid-item { width: 23%; margin-bottom: 1rem; }
        .grid-item { float: left; border-radius: 0.5rem; overflow: hidden; box-shadow: 0 1px 2px rgba(0,0,0,0.1); background: #e4e4e7; min-height: 200px; transition: background 0.3s; }
        .grid-item.content-loaded { min-height: 0; background: #fff; }
        .grid-item img { display: block; width: 100%; height: auto; opacity: 0; transition: opacity 0.3s ease-in; }
        .grid-item img[data-loaded="true"] { opacity: 1; }

        @media (max-width: 1024px) { .grid-sizer, .grid-item { width: 31%; } }
        @media (max-width: 768px) { .grid-sizer, .grid-item { width: 48%; } }
        @media (max-width: 480px) { .grid-sizer, .grid-item { width: 100%; } }
    </style>
</head>
<body>
    <h1>Static Gallery</h1>
    <div class="filter-nav">${navButtons}</div>
    ${gallerySections}

    <script src="lib/masonry.pkgd.min.js"></script>
    <script src="lib/imagesloaded.pkgd.min.js"></script>
    <script src="lib/lozad.min.js"></script>
    <script>
        var masonryInstances = [];
        document.addEventListener('DOMContentLoaded', function() {
            var grids = document.querySelectorAll('.grid');
            grids.forEach(function(grid) {
                var msnry = new Masonry(grid, { itemSelector: '.grid-item', columnWidth: '.grid-sizer', percentPosition: true, gutter: 15 });
                masonryInstances.push(msnry);
            });

            const observer = lozad('.lozad', {
                rootMargin: '200px 0px',
                loaded: function(el) {
                    el.onload = function() {
                        el.setAttribute('data-loaded', true);
                        el.closest('.grid-item').classList.add('content-loaded');
                        masonryInstances.forEach(m => m.layout());
                    }
                    if (el.complete && el.naturalHeight !== 0) el.onload();
                }
            });
            observer.observe();
            setTimeout(() => { masonryInstances.forEach(m => m.layout()); }, 500);
        });

        function filterGallery(type) {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            event.target.classList.add('active');
            document.querySelectorAll('.gallery-section').forEach(s => {
                s.style.display = (type === 'all' || s.id === 'section-' + type) ? 'block' : 'none';
            });
            setTimeout(() => { masonryInstances.forEach(m => m.layout()); }, 50);
        }
    </script>
</body>
</html>`;
    await Bun.write(join(DEST_DIR, 'gallery.html'), htmlContent);
}

async function generateIndexHtml() {
    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>RandomPic Demo</title>
    <style>
        body { font-family: system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; color: #333; }
        .card { border: 1px solid #ddd; padding: 1.5rem; margin-bottom: 1.5rem; border-radius: 0.75rem; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
        .btn { display: inline-block; padding: 0.5rem 1rem; background: #2563eb; color: white; text-decoration: none; border-radius: 0.375rem; }
        img { max-width: 100%; border-radius: 0.375rem; background: #f4f4f5; display: block; }
        #bg-box { height: 250px; background-size: cover; background-position: center; border-radius: 0.5rem; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 1.5rem; text-shadow: 0 2px 4px rgba(0,0,0,0.5); transition: background-image 0.5s ease; }
    </style>
</head>
<body>
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
        <h1>RandomPic API Demo</h1>
        <a href="gallery.html" class="btn">View Gallery</a>
    </div>

    <div class="card">
        <h2>Horizontal Background</h2>
        <div id="bg-box">Random Background Header</div>
    </div>

    <div class="card">
        <h2>Img Tag (Horizontal)</h2>
        <p><code>&lt;img alt="random:h"&gt;</code></p>
        <img alt="random:h" style="min-height: 200px">
    </div>

    <div class="card">
        <h2>Img Tag (Vertical)</h2>
        <p><code>&lt;img alt="random:v"&gt;</code></p>
        <img alt="random:v" style="max-height: 400px; min-height: 200px;">
    </div>

    <script src="random.js"></script>
</body>
</html>`;
    await Bun.write(join(DEST_DIR, 'index.html'), htmlContent);
}

async function main() {
    console.log('Starting build process...');

    // Clean dest folder
    await rm(DEST_DIR, { recursive: true, force: true });
    await ensureDir(DEST_DIR);

    // Process horizontal and vertical images
    const hCount = await processImages('h');
    const vCount = await processImages('v');

    const manifest: Manifest = {
        h: hCount,
        v: vCount,
        generated_at: new Date().toISOString()
    };

    const manifestPath = join(DEST_DIR, 'manifest.json');
    await Bun.write(manifestPath, JSON.stringify(manifest, null, 2));

    await copyLibs();
    await generateClientJS(manifest);
    await generateGalleryHtml(manifest);
    await generateIndexHtml();

    console.log('Build complete!');
    console.log('Manifest:', manifest);
}

main().catch(console.error);