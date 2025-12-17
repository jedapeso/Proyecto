// ========== CONFIGURACIÓN COMPARTIDA DEL TABLERO DE CIRUGÍA ==========
const CONFIG_TABLERO = {
    // Tiempos
    DURACION_LLAMADO_SEG: 20,
    INTERVALO_ACTUALIZACION: 5000,
    
    // Capacidades de áreas
    CAPACIDADES: {
        P: 5,
        Q: 7,
        R: 14
    },
    
    // Control de audio
    audioPreparado: false,
    audioElement: null,       // Para sonido fuerte (TV)
    audioSutilElement: null   // Para sonido suave (Celular)
};

// Convertir letra de estado a descripción
CONFIG_TABLERO.estadoLetraADescripcion = function(letra) {
    const estados = {
        P: 'PREPARACION',
        Q: 'QUIROFANO',
        R: 'RECUPERACION'
    };
    return estados[letra] || 'PREPARACION';
};

// Ocultar identificación
CONFIG_TABLERO.ocultarIdentificacion = function(id) {
    const idStr = String(id);
    return idStr.slice(0, -4) + '****';
};

// Ocultar nombre
CONFIG_TABLERO.ocultarNombre = function(nombre) {
    return nombre
        .split(' ')
        .filter(palabra => palabra.length > 0)
        .map(palabra => palabra.substring(0, 3) + '***')
        .join(' ');
};

// 🎵 Preparar audio (llamar con interacción del usuario)
CONFIG_TABLERO.prepararAudio = function() {
    if (this.audioPreparado) return;
    
    try {
        // AUDIO 1: Fuerte (TV/Sala)
        this.audioElement = new Audio();
        // Tono de alerta corto (tu base64 original)
        const audioData = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIGWm98OScTgwOU6nh77ViHAU7k9r0y3krBSJ2yPDej0EKElyw6Omp';
        this.audioElement.src = audioData;
        this.audioElement.volume = 0.8;
        this.audioElement.load();
        
        // AUDIO 2: Sutil (Celular) - Tono suave tipo notificación
        this.audioSutilElement = new Audio();
        // Base64 de un "ding" suave y agradable
        const audioSutilData = 'data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YUoNAACBiYqJdG1vbICPmJ+blYl/d2tqbXR6gIaPl5qXko2Ih4SEhYaIi42OjoqHhYSEhYeKjI2NjImGhIODhIeJi4uLioaEgoGBgoSHiYmIh4WEg4KChISGh4iIiIeFhIOCgoKDhYaHh4eGhIOCgoKCg4SFhoaGhYSDgoGBgoOEhYWFhYWEg4KBgYGChIOEhISEhIODgoGBgYGChIODg4ODg4OCgYGAgICBgoKCgoKCgoGBgYCAgICBgoGBgYGBgQAAAAA=';
        this.audioSutilElement.src = audioSutilData;
        this.audioSutilElement.volume = 0.3; // Volumen bajo para no asustar
        this.audioSutilElement.load();

        this.audioPreparado = true;
        console.log('✅ Audios preparados correctamente (Fuerte y Sutil)');
    } catch (e) {
        console.error('❌ Error al preparar audio:', e);
    }
};

// 🔊 Reproducir sonido (Soporta modos: 'normal' o 'sutil')
CONFIG_TABLERO.reproducirSonido = function(modo = 'normal') {
    let exito = false;
    
    // Si piden modo SUTIL (para celular)
    if (modo === 'sutil' && this.audioSutilElement) {
        try {
            this.audioSutilElement.currentTime = 0;
            this.audioSutilElement.play()
                .then(() => console.log('🔊 Audio Sutil: Exitoso'))
                .catch(e => console.warn('⚠️ Audio Sutil bloqueado (falta interacción):', e));
            return true;
        } catch (e) { console.warn('Fallo audio sutil HTML5'); }
    }

    // Si es modo NORMAL o falló el sutil, usamos el método robusto original
    if (modo === 'normal') {
        // MÉTODO 1: Audio Element
        try {
            if (this.audioElement) {
                this.audioElement.currentTime = 0;
                this.audioElement.play()
                    .then(() => { console.log('🔊 Audio Normal: Exitoso'); exito = true; })
                    .catch(err => console.warn('⚠️ Audio Normal bloqueado:', err.message));
            }
        } catch (e) { console.warn('⚠️ Error audio element:', e); }
        
        // Si ya tuvo éxito, retornamos. Si no, probamos Web Audio API como respaldo
        if (exito) return true;

        // MÉTODO 2: Web Audio API (Respaldo)
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
                const ctx = new AudioContext();
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                
                osc.connect(gain);
                gain.connect(ctx.destination);
                
                // Configurar tono según modo
                if (modo === 'sutil') {
                    osc.frequency.value = 600; // Tono más grave/suave
                    gain.gain.value = 0.1;     // Volumen muy bajo
                } else {
                    osc.frequency.value = 880; // Tono agudo alerta
                    gain.gain.value = 0.3;     // Volumen medio
                }

                osc.start();
                osc.stop(ctx.currentTime + 0.3);
                console.log('🔊 WebAudio Backup: Exitoso');
                return true;
            }
        } catch (e) { console.warn('⚠️ WebAudio falló:', e); }
    }
    
    return false;
};

// Validar capacidad
CONFIG_TABLERO.validarCapacidad = function(estadoLetra, cantidad) {
    const limite = this.CAPACIDADES[estadoLetra];
    if (!limite) return { estado: 'ok', mensaje: 'Normal' };
    
    if (cantidad > limite) {
        return { estado: 'excedida', mensaje: `Sobrecupo: ${cantidad}/${limite}` };
    } else if (cantidad === limite) {
        return { estado: 'completa', mensaje: `Capacidad completa: ${cantidad}/${limite}` };
    } else {
        return { estado: 'disponible', mensaje: `Disponible: ${cantidad}/${limite}` };
    }
};

console.log('✅ CONFIG_TABLERO cargado correctamente');
