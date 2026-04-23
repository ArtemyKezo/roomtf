const fileInput = document.getElementById("fileInput");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const colorPicker = document.getElementById("colorPicker");
const applyBtn = document.getElementById("applyBtn");
const resetBtn = document.getElementById("resetBtn");
const toggleBtn = document.getElementById("toggleBtn");
const downloadBtn = document.getElementById("downloadBtn");
const thresholdInput = document.getElementById("threshold");

let originalImageData = null;
let currentImageData = null;
let imageLoaded = false;

let targetHSL = null;
let showOriginal = false;

// --- Загрузка ---
fileInput.addEventListener("change", function () {
    const file = fileInput.files[0];
    if (!file) {
        alert("Файл не выбран");
        return;
    }

    console.log("Файл:", file);

    const img = new Image();
    const reader = new FileReader();

    reader.onload = function (e) {
        img.src = e.target.result;
    };

    reader.onerror = function () {
        alert("Ошибка чтения файла");
    };

    img.onload = function () {
        console.log("Изображение загружено");

        canvas.width = img.width;
        canvas.height = img.height;

        ctx.drawImage(img, 0, 0);

        try {
            originalImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            currentImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            imageLoaded = true;
        } catch (e) {
            alert("Ошибка canvas (возможно проблема безопасности)");
            console.error(e);
        }
    };

    img.onerror = function () {
        alert("Ошибка загрузки изображения");
    };

    reader.readAsDataURL(file);
});

// --- Пипетка ---
canvas.addEventListener("click", function (e) {
    if (!imageLoaded) return;

    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) * canvas.width / rect.width);
    const y = Math.floor((e.clientY - rect.top) * canvas.height / rect.height);

    const pixel = ctx.getImageData(x, y, 1, 1).data;
    targetHSL = rgbToHsl(pixel[0], pixel[1], pixel[2]);

    alert("🎯 Цвет стены выбран!");
});

// --- Применение ---
applyBtn.addEventListener("click", function () {
    if (!imageLoaded || !targetHSL) {
        alert("Сначала кликни по стене");
        return;
    }

    const threshold = parseFloat(thresholdInput.value);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    const newRGB = hexToRgb(colorPicker.value);
    const newHSL = rgbToHsl(newRGB.r, newRGB.g, newRGB.b);

    for (let i = 0; i < data.length; i += 4) {
        let r = data[i];
        let g = data[i + 1];
        let b = data[i + 2];

        const hsl = rgbToHsl(r, g, b);

        // --- Умная фильтрация ---
        const hDiff = hueDistance(hsl.h, targetHSL.h);
        const sDiff = Math.abs(hsl.s - targetHSL.s);
        const lDiff = Math.abs(hsl.l - targetHSL.l);

        // Взвешенная разница (ключ к "умности")
        const diff = hDiff * 0.6 + sDiff * 0.25 + lDiff * 0.15;

        // Отсекаем:
        if (hsl.s < 0.1) continue;          // серое / шум
        if (hsl.l < 0.1 || hsl.l > 0.9) continue; // тени / пересвет

        if (diff < threshold) {
            // --- Плавное смешивание ---
            const blend = 0.7 * (1 - diff / threshold);

            const mixedH = mix(hsl.h, newHSL.h, blend);
            const mixedS = mix(hsl.s, newHSL.s, blend * 0.6);
            const mixedL = hsl.l; // сохраняем освещение!

            const rgb = hslToRgb(mixedH, mixedS, mixedL);

            data[i] = rgb.r;
            data[i + 1] = rgb.g;
            data[i + 2] = rgb.b;
        }
    }

    ctx.putImageData(imageData, 0, 0);
    currentImageData = imageData;
});

// --- Сброс ---
resetBtn.addEventListener("click", function () {
    if (!imageLoaded) return;
    ctx.putImageData(originalImageData, 0, 0);
});

// --- До / После ---
toggleBtn.addEventListener("click", function () {
    if (!imageLoaded) return;

    showOriginal = !showOriginal;

    ctx.putImageData(showOriginal ? originalImageData : currentImageData, 0, 0);
});

// --- Скачать ---
downloadBtn.addEventListener("click", function () {
    const link = document.createElement("a");
    link.download = "roomtransform_pro.png";
    link.href = canvas.toDataURL();
    link.click();
});

// ==========================
// 🔥 УЛУЧШЕННЫЕ ФУНКЦИИ
// ==========================

function hueDistance(h1, h2) {
    let d = Math.abs(h1 - h2);
    return Math.min(d, 1 - d);
}

function mix(a, b, t) {
    return a * (1 - t) + b * t;
}

function hexToRgb(hex) {
    const bigint = parseInt(hex.slice(1), 16);
    return {
        r: (bigint >> 16) & 255,
        g: (bigint >> 8) & 255,
        b: bigint & 255
    };
}

function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);

    let h, s, l = (max + min) / 2;

    if (max === min) {
        h = s = 0;
    } else {
        const d = max - min;

        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }

        h /= 6;
    }

    return { h, s, l };
}

function hslToRgb(h, s, l) {
    let r, g, b;

    if (s === 0) {
        r = g = b = l;
    } else {
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1/6) return p + (q - p) * 6 * t;
            if (t < 1/2) return q;
            if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        };

        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;

        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
    }

    return {
        r: Math.round(r * 255),
        g: Math.round(g * 255),
        b: Math.round(b * 255)
    };
}