import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs-extra';
import { spawn } from 'child_process';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Standard-Medienverzeichnis
const defaultDir = path.join(require('os').homedir(), 'Videos');
let currentMediaDir = (process.env.MEDIA_DIR && process.env.MEDIA_DIR !== 'undefined') 
    ? process.env.MEDIA_DIR 
    : (fs.existsSync(defaultDir) ? defaultDir : process.cwd());

// Hilfsfunktion für den rekursiven Dateiscan
async function getVideosRecursive(dir: string, baseDir: string): Promise<any[]> {
    let results: any[] = [];
    if (!fs.existsSync(dir)) return results;
    
    const list = await fs.readdir(dir);

    for (const file of list) {
        const filePath = path.join(dir, file);
        const stat = await fs.stat(filePath);

        if (stat && stat.isDirectory()) {
            if (file !== '.thumbnails' && !file.startsWith('.')) {
                const res = await getVideosRecursive(filePath, baseDir);
                results = results.concat(res);
            }
        } else if (['.mp4', '.mkv', '.avi', '.mov'].includes(path.extname(file).toLowerCase())) {
            const relativePath = path.relative(baseDir, filePath);
            const toSafeBase64 = (str: string) => {
                return Buffer.from(str, 'utf8').toString('base64')
                    .replace(/\+/g, '-')
                    .replace(/\//g, '_')
                    .replace(/=+$/, '');
            };
            const id = toSafeBase64(relativePath);
            
            const parentDir = path.dirname(filePath);
            const posterFiles = ['poster.jpg', 'poster.png', 'folder.jpg', 'folder.png', 'cover.jpg', 'cover.png'];
            let posterPath = null;
            
            for (const p of posterFiles) {
                const pPath = path.join(parentDir, p);
                if (fs.existsSync(pPath)) {
                    posterPath = `/api/poster/${id}`;
                    break;
                }
            }

            results.push({
                name: file,
                id: id,
                thumbnail: posterPath || `/thumbnails/${id}.png`
            });
        }
    }
    return results;
}

app.use(cors());
app.use(express.json());

const frontendDist = process.env.FRONTEND_DIST || path.join(__dirname, '../../frontend/dist');
app.use(express.static(frontendDist));

const getThumbnailDir = () => path.join(currentMediaDir, '.thumbnails');

app.use('/thumbnails', (req, res, next) => {
    express.static(getThumbnailDir())(req, res, next);
});

// --- THUMBNAIL QUEUE ---
const thumbnailQueue: { id: string, filePath: string, thumbnailPath: string, filename: string, res?: Response }[] = [];
let isProcessingQueue = false;

async function processNextInQueue() {
    if (thumbnailQueue.length === 0) {
        isProcessingQueue = false;
        return;
    }

    isProcessingQueue = true;
    const task = thumbnailQueue.shift();
    if (!task) return;

    const { id, filePath, thumbnailPath, filename, res } = task;

    // Falls die Datei schon existiert (während wir in der Queue gewartet haben)
    if (fs.existsSync(thumbnailPath)) {
        if (res && !res.headersSent) res.sendFile(thumbnailPath);
        processNextInQueue();
        return;
    }

    try {
        const absolutePath = path.resolve(filePath);
        
        const ffmpegProcess = spawn('ffmpeg', [
            '-nostdin',
            '-ss', '10',
            '-i', absolutePath,
            '-frames:v', '1',
            '-s', '320x180',
            '-y',
            thumbnailPath
        ]);

        // SICHERHEITS-TIMEOUT: Max 30 Sekunden pro Bild
        const timeout = setTimeout(() => {
            ffmpegProcess.kill('SIGKILL');
            console.error(`FFmpeg Timeout (30s) bei Datei: ${filename}`);
            if (res && !res.headersSent) res.status(504).send('Timeout');
            processNextInQueue();
        }, 30000);

        ffmpegProcess.on('close', (code: number) => {
            clearTimeout(timeout);
            if (code === 0) {
                console.log(`Thumbnail erstellt für: ${filename} (Warteschlange: ${thumbnailQueue.length})`);
                if (res && !res.headersSent) res.sendFile(thumbnailPath);
            } else {
                console.error(`FFmpeg Fehler Code ${code} bei: ${filename}`);
                if (res && !res.headersSent) res.status(500).send('Fehler');
            }
            processNextInQueue();
        });

        ffmpegProcess.on('error', (err: any) => {
            clearTimeout(timeout);
            console.error(`FFmpeg Start-Fehler:`, err);
            if (res && !res.headersSent) res.status(500).send('Fehler');
            processNextInQueue();
        });
    } catch (error) {
        if (res && !res.headersSent) res.status(500).send('Fehler');
        processNextInQueue();
    }
}

// HINTERGRUND-SCANNER
async function startBackgroundScan(videos: any[]) {
    console.log("Starte Hintergrund-Scan für fehlende Thumbnails...");
    const thumbnailDir = getThumbnailDir();
    await fs.ensureDir(thumbnailDir);

    for (const video of videos) {
        const relativePath = fromSafeBase64(video.id);
        const filePath = path.join(currentMediaDir, relativePath);
        const thumbnailPath = path.join(thumbnailDir, `${video.id}.png`);

        // Nur einreihen, wenn Bild fehlt
        if (!fs.existsSync(thumbnailPath)) {
            // Prüfen ob schon in Queue
            const alreadyInQueue = thumbnailQueue.some(t => t.id === video.id);
            if (!alreadyInQueue) {
                thumbnailQueue.push({ id: video.id, filePath, thumbnailPath, filename: video.name });
            }
        }
    }
    
    if (!isProcessingQueue && thumbnailQueue.length > 0) {
        processNextInQueue();
    }
}

// --- API ROUTEN ---

app.get('/api/poster/:id', async (req: Request, res: Response) => {
    try {
        const relativePath = fromSafeBase64(req.params.id);
        const filePath = path.join(currentMediaDir, relativePath);
        const parentDir = path.dirname(filePath);
        const posterFiles = ['poster.jpg', 'poster.png', 'folder.jpg', 'folder.png', 'cover.jpg', 'cover.png'];
        for (const p of posterFiles) {
            const pPath = path.join(parentDir, p);
            if (fs.existsSync(pPath)) return res.sendFile(pPath);
        }
        res.status(404).send('Kein Poster');
    } catch (e) { res.status(500).send('Fehler'); }
});

app.post('/api/set-media-dir', async (req: Request, res: Response) => {
    const { dirPath } = req.body;
    if (!dirPath || !fs.existsSync(dirPath)) return res.status(400).json({ error: 'Pfad ungültig' });
    currentMediaDir = dirPath;
    await fs.ensureDir(getThumbnailDir());
    res.json({ message: 'Medienverzeichnis aktualisiert', currentMediaDir });
});

app.get('/api/videos', async (req: Request, res: Response) => {
    try {
        const videos = await getVideosRecursive(currentMediaDir, currentMediaDir);
        res.json(videos);
        // SOFORT DEN HINTERGRUND-SCAN STARTEN
        startBackgroundScan(videos);
    } catch (error) { res.status(500).json({ error: 'Fehler' }); }
});

const fromSafeBase64 = (base64: string) => {
    let s = base64.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    return Buffer.from(s, 'base64').toString('utf8');
};

app.get('/api/stream/:id', async (req: Request, res: Response) => {
    const filename = fromSafeBase64(req.params.id);
    const filePath = path.join(currentMediaDir, filename);
    if (!fs.existsSync(filePath)) return res.status(404).send('Nicht gefunden');
    const stat = await fs.stat(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;
    if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        res.writeHead(206, { 'Content-Range': `bytes ${start}-${end}/${fileSize}`, 'Accept-Ranges': 'bytes', 'Content-Length': (end - start) + 1, 'Content-Type': 'video/mp4' });
        fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
        res.writeHead(200, { 'Content-Length': fileSize, 'Content-Type': 'video/mp4' });
        fs.createReadStream(filePath).pipe(res);
    }
});

app.get('/api/generate-thumbnail/:id', async (req: Request, res: Response) => {
    const relativePath = fromSafeBase64(req.params.id);
    const filePath = path.join(currentMediaDir, relativePath);
    const thumbnailPath = path.join(getThumbnailDir(), `${req.params.id}.png`);

    if (fs.existsSync(thumbnailPath)) return res.sendFile(thumbnailPath);

    // Falls das Bild fehlt, priorisiert in die Queue (vorne anstellen)
    const task = { id: req.params.id, filePath, thumbnailPath, filename: path.basename(filePath), res };
    thumbnailQueue.unshift(task); 
    
    if (!isProcessingQueue) processNextInQueue();
});

app.get('*', (req, res) => res.sendFile(path.join(frontendDist, 'index.html')));
app.listen(PORT, () => console.log(`Backend läuft auf http://localhost:${PORT}`));
