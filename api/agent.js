const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
    if (!req.query.id && !req.query.format) {
        return res.status(200).json({ status: 'alive', timestamp: Date.now() });
    }

    const AGENT_SECRET_KEY = process.env.AGENT_SECRET_KEY || '1234567';
    const requestKey = req.headers['x-agent-key'];
    if (requestKey !== AGENT_SECRET_KEY) {
        return res.status(403).json({ success: false, message: 'Forbidden: Invalid Agent Key' });
    }

    const { id: videoId, format: requestedFormat } = req.query;
    if (!videoId || !requestedFormat) {
        return res.status(400).json({ success: false, message: 'Error: Missing video ID or format.' });
    }

   
    const donorHandlers = [
        handle_mp3youtube_cc,    
        handle_savenow_to,       
        handle_mp3youtube_cc,    
        handle_savenow_to,       
        handle_mp3youtube_cc,    
        handle_genyoutube_online 
    ];
    
    const selectedHandler = donorHandlers[Math.floor(Math.random() * donorHandlers.length)];


    try {
        const result = await selectedHandler(videoId, requestedFormat);
        res.status(200).json(result);
    } catch (error) {
        console.error(`CRITICAL AGENT ERROR with handler ${selectedHandler.name}:`, error.message);
        res.status(500).json({ success: false, message: `Agent Error: ${error.message}` });
    }
};

async function handle_genyoutube_online(videoId, requestedFormat) {
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
        'Origin': 'http://genyoutube.online', 'Referer': 'http://genyoutube.online/en1/',
        'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    };
    try {
        const analyzeUrl = 'http://genyoutube.online/mates/en/analyze/ajax';
        const analyzePayload = new URLSearchParams({ url: youtubeUrl, ajax: '1', lang: 'en', platform: 'youtube' });
        const res1 = await axios.post(analyzeUrl, analyzePayload.toString(), { headers, timeout: 60000 });
        const dataStep1 = res1.data;
        if (dataStep1?.status !== 'success' || !dataStep1.result) return { success: false, message: 'Donor Error (genyoutube): Failed at Step 1.', details: dataStep1 };

        const $ = cheerio.load(dataStep1.result);
        const buttons = $('button[onclick^="download("]');
        let foundFormatData = null;
        for (const button of buttons) {
            const onclickAttr = $(button).attr('onclick');
            const paramsMatch = onclickAttr.match(/download\((.*)\)/s);
            if (paramsMatch && paramsMatch[1]) {
                const params = paramsMatch[1].split(',').map(p => p.trim().replace(/^'|'$/g, ''));
                if (params.length === 7) {
                    const formatData = { youtube_url: params[0], title: params[1], hash_id: params[2], ext: params[3], size: params[4], quality: params[5], format_code: params[6] };
                    if ((requestedFormat === 'mp3' && formatData.ext === 'mp3') || (requestedFormat === '720' && formatData.quality === '720p')) {
                        foundFormatData = formatData;
                        break;
                    }
                }
            }
        }
        if (!foundFormatData) return { success: false, message: `Donor Error (genyoutube): Format (${requestedFormat}) not found.` };

        const convertUrl = `http://genyoutube.online/mates/en/convert?id=${foundFormatData.hash_id}`;
        const convertPayload = new URLSearchParams({ id: foundFormatData.hash_id, platform: 'youtube', url: foundFormatData.youtube_url, title: foundFormatData.title, ext: foundFormatData.ext, note: foundFormatData.quality, format: foundFormatData.format_code });
        const convertHeaders = { ...headers, 'X-Note': foundFormatData.quality };
        const res2 = await axios.post(convertUrl, convertPayload.toString(), { headers: convertHeaders, timeout: 60000 });
        const dataStep2 = res2.data;

        if (dataStep2?.status === 'success' && dataStep2?.downloadUrlX) {
            return { success: true, download_url: dataStep2.downloadUrlX };
        } else {
            return { success: false, message: 'Donor Error (genyoutube): Failed to get final link.', details: dataStep2 };
        }
    } catch (error) {
        return { success: false, message: `Donor Error (genyoutube): Request failed - ${error.message}` };
    }
}

async function handle_mp3youtube_cc(videoId, requestedFormat) {
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const commonHeaders = { 'Origin': 'https://iframe.y2meta-uk.com', 'Referer': 'https://iframe.y2meta-uk.com/', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36' };
    try {
        const keyResponse = await axios.get('https://api.mp3youtube.cc/v2/sanity/key', { headers: commonHeaders, timeout: 10000 });
        const apiKey = keyResponse.data?.key;
        if (!apiKey) return { success: false, message: 'Donor Error (y2meta): Could not extract API key.' };

        const converterHeaders = { ...commonHeaders, 'Key': apiKey };
        let postData = {};
        if (requestedFormat === 'mp3') postData = { link: youtubeUrl, format: 'mp3', audioBitrate: '320', filenameStyle: 'pretty' };
        else if (requestedFormat === '720') postData = { link: youtubeUrl, format: 'mp4', audioBitrate: '128', videoQuality: '720', filenameStyle: 'pretty', vCodec: 'h264' };
        else return { success: false, message: 'Unsupported format requested.' };

        const convertResponse = await axios.post('https://api.mp3youtube.cc/v2/converter', new URLSearchParams(postData).toString(), { headers: { ...converterHeaders, 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 60000 });
        const resultData = convertResponse.data;

        if (resultData?.status === 'tunnel' && resultData?.url) {
            return { success: true, download_url: resultData.url };
        } else {
            return { success: false, message: 'Donor Error (y2meta): Failed to get final link.', details: resultData };
        }
    } catch (error) {
        return { success: false, message: `Donor Error (y2meta): Request failed - ${error.message}` };
    }
}

async function handle_savenow_to(videoId, requestedFormat) {
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const apiUrl = `https://p.savenow.to/ajax/download.php?url=${encodeURIComponent(youtubeUrl)}&format=${requestedFormat}&api=dfcb6d76f2f6a9894gjkege8a4ab232222`;
    const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36', 'Referer': 'https://y2down.cc/' };
    try {
        const res1 = await axios.get(apiUrl, { headers, timeout: 30000 });
        const dataStep1 = res1.data;
        const taskId = dataStep1?.id;
        const progressUrl = dataStep1?.progress_url || `https://p.savenow.to/api/progress?id=${taskId}`;
        if (!taskId) return { success: false, message: 'Donor Error (savenow): Failed to get task ID.', details: dataStep1 };

        for (let i = 0; i < 40; i++) {
            await new Promise(resolve => setTimeout(resolve, 2000));
            const res2 = await axios.get(progressUrl, { headers, timeout: 10000 });
            const progressData = res2.data;
            const statusText = progressData?.text?.toLowerCase();
            if (statusText === 'finished') {
                if (progressData.download_url) return { success: true, download_url: progressData.download_url };
            } else if (statusText === 'error') {
                return { success: false, message: `Donor Error (savenow): ${progressData.error || 'Unknown error'}` };
            }
        }
        return { success: false, message: 'Donor Error (savenow): Timed out waiting for link.' };
    } catch (error) {
        return { success: false, message: `Donor Error (savenow): Request failed - ${error.message}` };
    }
}
