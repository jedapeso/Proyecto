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
    audioElement: null
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
        // Crear elemento de audio vacío y prepararlo
        this.audioElement = new Audio();
        
        // Datos de audio en base64 (tono de alerta corto)
        const audioData = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIGWm98OScTgwOU6nh77ViHAU7k9r0y3krBSJ2yPDej0EKElyw6Omp';
        
        this.audioElement.src = audioData;
        this.audioElement.volume = 0.7;
        this.audioElement.load();
        
        this.audioPreparado = true;
        console.log('✅ Audio preparado correctamente');
    } catch (e) {
        console.error('❌ Error al preparar audio:', e);
    }
};

// 🔊 Reproducir sonido (múltiples métodos)
CONFIG_TABLERO.reproducirSonido = function() {
    let exitoMetodo1 = false;
    let exitoMetodo2 = false;
    let exitoMetodo3 = false;
    
    // MÉTODO 1: Audio Element (más confiable)
    try {
        if (this.audioElement) {
            this.audioElement.currentTime = 0;
            const promise = this.audioElement.play();
            
            if (promise !== undefined) {
                promise
                    .then(() => {
                        console.log('🔊 Método 1 (Audio): Exitoso');
                        exitoMetodo1 = true;
                    })
                    .catch(err => {
                        console.warn('⚠️ Método 1 (Audio): Fallido -', err.message);
                    });
            }
        }
    } catch (e) {
        console.warn('⚠️ Método 1: Error -', e.message);
    }
    
    // MÉTODO 2: Web Audio API (respaldo)
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }
        
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = 880; // La5 (más agudo)
        oscillator.type = 'sine';
        
        const now = audioContext.currentTime;
        gainNode.gain.setValueAtTime(0.4, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
        
        oscillator.start(now);
        oscillator.stop(now + 0.4);
        
        exitoMetodo2 = true;
        console.log('🔊 Método 2 (WebAudio): Exitoso');
        
    } catch (e) {
        console.warn('⚠️ Método 2: Error -', e.message);
    }
    
    // MÉTODO 3: Beep del sistema (último recurso)
    try {
        // En algunos navegadores antiguos funciona
        const beep = new Audio('data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU' + 
            'oNAACBiYqJdG1vbICPmJ+blYl/d2tqbXR6gIaPl5qXko2Ih4SEhYaIi42OjoqHhYSEhYeKjI2NjImGhIODhIeJi4uLioaEgoGBgoSHiYmIh4WEg4KChISGh4iIiIeFhIOCgoKDhYaHh4eGhIOCgoKCg4SFhoaGhYSDgoGBgoOEhYWFhYWEg4KBgYGChIOEhISEhIODgoGBgYGChIODg4ODg4OCgYGAgICBgoKCgoKCgoGBgYCAgICBgoGBgYGBgQAAAAA=');
        beep.play();
        exitoMetodo3 = true;
        console.log('🔊 Método 3 (Beep): Exitoso');
    } catch (e) {
        console.warn('⚠️ Método 3: Error -', e.message);
    }
    
    const exito = exitoMetodo1 || exitoMetodo2 || exitoMetodo3;
    if (!exito) {
        console.error('❌ TODOS los métodos de audio fallaron');
    }
    
    return exito;
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
