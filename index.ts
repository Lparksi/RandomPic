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
    let navButtons = `<button class="filter-btn active" onclick="filterGallery('all')">全部</button>`;

    for (const type of types) {
        const count = manifest[type];
        if (count === 0) continue;

        const label = type === 'h' ? '横屏' : '竖屏';
        navButtons += `<button class="filter-btn" onclick="filterGallery('${type}')">${label}</button>`;

        let itemsHtml = '';
        for (let i = 0; i < count; i++) {
            const url = (DOMAIN ? `${DOMAIN}/` : '') + `${type}/${i}.webp`;
            itemsHtml += `
            <div class="grid-item" onclick="openLightbox('${url}')">
                <div class="img-wrapper">
                    <img class="lozad" data-src="${url}" alt="${type}-${i}">
                </div>
            </div>`;
        }

        gallerySections += `
        <section id="section-${type}" class="gallery-section">
            <h2 class="section-title"><span>#</span> ${label}图片</h2>
            <div class="grid" id="grid-${type}">
                <div class="grid-sizer"></div>
                ${itemsHtml}
            </div>
        </section>
        `;
    }

    const htmlContent = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>RandomPic Gallery | 精选画廊</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg: #09090b;
            --fg: #fafafa;
            --accent: #3b82f6;
            --card-bg: #18181b;
            --border: rgba(255, 255, 255, 0.1);
            --text-muted: #a1a1aa;
        }

        * { box-sizing: border-box; }
        body { 
            font-family: 'Outfit', -apple-system, system-ui, sans-serif; 
            margin: 0; 
            padding: 0; 
            background: var(--bg); 
            color: var(--fg);
            line-height: 1.5;
        }

        header {
            padding: 4rem 2rem 2rem;
            text-align: center;
            background: radial-gradient(circle at top center, rgba(59, 130, 246, 0.15), transparent);
        }

        h1 { 
            font-size: 3rem; 
            margin: 0; 
            font-weight: 600; 
            letter-spacing: -0.05em;
            background: linear-gradient(to bottom, #fff, #a1a1aa);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        .subtitle { color: var(--text-muted); margin-top: 0.5rem; font-size: 1.1rem; }

        .filter-nav { 
            position: sticky;
            top: 1rem;
            z-index: 50;
            display: flex;
            justify-content: center;
            gap: 0.5rem;
            margin: 2rem 0;
            padding: 0.5rem;
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            background: rgba(9, 9, 11, 0.7);
            width: fit-content;
            margin-left: auto;
            margin-right: auto;
            border-radius: 1rem;
            border: 1px solid var(--border);
        }

        .filter-btn {
            background: transparent; border: none; padding: 0.6rem 1.2rem;
            border-radius: 0.75rem; cursor: pointer; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            color: var(--text-muted); font-weight: 500; font-size: 0.95rem;
        }
        .filter-btn:hover { color: var(--fg); background: rgba(255,255,255,0.05); }
        .filter-btn.active { background: var(--accent); color: white; box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3); }
        
        main { padding: 0 2rem 4rem; max-width: 1400px; margin: 0 auto; }

        .gallery-section { margin-bottom: 4rem; animation: fadeIn 0.8s ease-out; }
        .section-title { 
            font-size: 1.5rem; 
            margin-bottom: 2rem; 
            display: flex; 
            align-items: center; 
            gap: 0.75rem;
            font-weight: 600;
        }
        .section-title span { color: var(--accent); opacity: 0.8; }
        
        .grid { margin: 0 auto; }
        .grid-sizer, .grid-item { width: calc(25% - 12px); margin-bottom: 16px; }
        
        .grid-item { 
            cursor: zoom-in;
            border-radius: 1rem; 
            overflow: hidden; 
            background: var(--card-bg); 
            border: 1px solid var(--border);
            transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .grid-item:hover {
            transform: translateY(-4px);
            border-color: rgba(255,255,255,0.2);
            box-shadow: 0 12px 24px -8px rgba(0,0,0,0.5);
        }

        .img-wrapper { width: 100%; position: relative; overflow: hidden; }
        .grid-item img { 
            display: block; 
            width: 100%; 
            height: auto; 
            opacity: 0; 
            transition: opacity 0.6s ease-out, transform 0.6s ease-out; 
            transform: scale(1.05);
        }
        .grid-item img[data-loaded="true"] { opacity: 1; transform: scale(1); }

        /* Lightbox */
        #lightbox {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.95);
            backdrop-filter: blur(10px);
            display: none; justify-content: center; align-items: center;
            z-index: 1000; cursor: zoom-out;
            animation: fadeIn 0.3s ease-out;
        }
        #lightbox img { max-width: 90%; max-height: 90%; border-radius: 0.5rem; object-fit: contain; box-shadow: 0 0 40px rgba(0,0,0,0.5); }

        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

        @media (max-width: 1024px) { .grid-sizer, .grid-item { width: calc(33.333% - 11px); } h1 { font-size: 2.5rem; } }
        @media (max-width: 768px) { .grid-sizer, .grid-item { width: calc(50% - 8px); } .filter-nav { width: 90%; } }
        @media (max-width: 480px) { .grid-sizer, .grid-item { width: 100%; } main { padding: 0 1rem; } }
    </style>
</head>
<body>
    <header>
        <h1>RandomPic Gallery</h1>
        <p class="subtitle">随机美图库 - 精选高清图集</p>
    </header>

    <div class="filter-nav">${navButtons}</div>
    
    <main>
        ${gallerySections}
    </main>

    <div id="lightbox" onclick="closeLightbox()">
        <img id="lightbox-img" src="" alt="Preview">
    </div>

    <script src="lib/masonry.pkgd.min.js"></script>
    <script src="lib/imagesloaded.pkgd.min.js"></script>
    <script src="lib/lozad.min.js"></script>
    <script>
        var masonryInstances = [];
        document.addEventListener('DOMContentLoaded', function() {
            var grids = document.querySelectorAll('.grid');
            grids.forEach(function(grid) {
                var msnry = new Masonry(grid, { 
                    itemSelector: '.grid-item', 
                    columnWidth: '.grid-sizer', 
                    percentPosition: true, 
                    gutter: 16 
                });
                
                imagesLoaded(grid).on('progress', function() {
                    msnry.layout();
                });

                masonryInstances.push(msnry);
            });

            const observer = lozad('.lozad', {
                rootMargin: '300px 0px',
                loaded: function(el) {
                    el.onload = function() {
                        el.setAttribute('data-loaded', true);
                        masonryInstances.forEach(m => m.layout());
                    }
                    if (el.complete && el.naturalHeight !== 0) el.onload();
                }
            });
            observer.observe();
        });

        function filterGallery(type) {
            const btns = document.querySelectorAll('.filter-btn');
            btns.forEach(b => b.classList.remove('active'));
            const activeBtn = Array.from(btns).find(b => b.getAttribute('onclick').includes("'"+type+"'"));
            if(activeBtn) activeBtn.classList.add('active');

            document.querySelectorAll('.gallery-section').forEach(s => {
                s.style.display = (type === 'all' || s.id === 'section-' + type) ? 'block' : 'none';
            });
            
            // Refresh masonry
            setTimeout(() => { masonryInstances.forEach(m => m.layout()); }, 100);
        }

        function openLightbox(url) {
            const lb = document.getElementById('lightbox');
            const lbImg = document.getElementById('lightbox-img');
            lbImg.src = url;
            lb.style.display = 'flex';
            document.body.style.overflow = 'hidden';
        }

        function closeLightbox() {
            const lb = document.getElementById('lightbox');
            lb.style.display = 'none';
            document.body.style.overflow = 'auto';
        }

        // Close on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeLightbox();
        });
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

    // Generate .wranglerignore to prevent uploading git config when deploying from dest branch
    const ignoreContent = `.git
.github
node_modules
.DS_Store
`;
    await Bun.write(join(DEST_DIR, '.wranglerignore'), ignoreContent);

    console.log('Build complete!');
    console.log('Manifest:', manifest);
}

main().catch(console.error);