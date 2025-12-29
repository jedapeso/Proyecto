
```
app_flask
├─ .env
├─ config
│  ├─ iconos
│  ├─ mails
│  │  └─ destinatarios.txt
│  └─ prompts
│     ├─ tablero_hos_v1.txt
│     └─ tablero_uci_v1.txt
├─ docker-compose.yml
├─ Dockerfile
├─ requirements.txt
├─ run.py
├─ src
│  ├─ celery_worker.py
│  ├─ db_engine.py
│  ├─ extensions.py
│  ├─ routes
│  │  ├─ cirugia
│  │  │  ├─ views.py
│  │  │  ├─ __init__.py
│  │  │  └─ __pycache__
│  │  │     ├─ views.cpython-311.pyc
│  │  │     └─ __init__.cpython-311.pyc
│  │  ├─ facturacion
│  │  │  ├─ tasks.py
│  │  │  ├─ views.py
│  │  │  ├─ __init__.py
│  │  │  └─ __pycache__
│  │  │     ├─ tasks.cpython-311.pyc
│  │  │     ├─ views.cpython-311.pyc
│  │  │     └─ __init__.cpython-311.pyc
│  │  ├─ hospitalizacion
│  │  │  ├─ views.py
│  │  │  ├─ __init__.py
│  │  │  └─ __pycache__
│  │  │     ├─ views.cpython-311.pyc
│  │  │     └─ __init__.cpython-311.pyc
│  │  ├─ main.py
│  │  ├─ tableros
│  │  │  ├─ views.py
│  │  │  ├─ viewsc.py
│  │  │  ├─ viewsh.py
│  │  │  ├─ viewsu.py
│  │  │  ├─ __init__.py
│  │  │  └─ __pycache__
│  │  │     ├─ views.cpython-311.pyc
│  │  │     ├─ viewsc.cpython-311.pyc
│  │  │     ├─ viewsh.cpython-311.pyc
│  │  │     ├─ viewsu.cpython-311.pyc
│  │  │     └─ __init__.cpython-311.pyc
│  │  ├─ urgencias
│  │  │  ├─ views.py
│  │  │  ├─ __init__.py
│  │  │  └─ __pycache__
│  │  │     ├─ views.cpython-311.pyc
│  │  │     └─ __init__.cpython-311.pyc
│  │  └─ __pycache__
│  │     └─ main.cpython-311.pyc
│  ├─ static
│  │  ├─ cirugia
│  │  │  ├─ css
│  │  │  │  └─ dashboard.css
│  │  │  └─ js
│  │  │     └─ dashboard.js
│  │  ├─ css
│  │  │  └─ styles.css
│  │  ├─ facturacion
│  │  │  ├─ css
│  │  │  │  └─ dashboard.css
│  │  │  └─ js
│  │  │     └─ dashboard.js
│  │  ├─ hospitalizacion
│  │  │  ├─ css
│  │  │  │  ├─ censo.css
│  │  │  │  ├─ dashboard.css
│  │  │  │  └─ tablero_uci.css
│  │  │  └─ js
│  │  │     ├─ censo.js
│  │  │     ├─ dashboard.js
│  │  │     ├─ grestancia.js
│  │  │     ├─ indicadores.js
│  │  │     └─ tablero_uci.js
│  │  ├─ tableros
│  │  │  ├─ css
│  │  │  │  ├─ dashboard.css
│  │  │  │  ├─ tablero_cir.css
│  │  │  │  ├─ tablero_cir_pub.css
│  │  │  │  ├─ tablero_hos.css
│  │  │  │  ├─ tablero_uci.css
│  │  │  │  ├─ tablero_urg.css
│  │  │  │  └─ vista_paciente.css
│  │  │  └─ js
│  │  │     ├─ config_tablero.js
│  │  │     ├─ DragDropTouch.js
│  │  │     ├─ indicadores.js
│  │  │     ├─ indicadores_hos.js
│  │  │     ├─ indicadores_urg,js
│  │  │     ├─ tablero_cir.js
│  │  │     ├─ tablero_cir_pub.js
│  │  │     ├─ tablero_hos.js
│  │  │     ├─ tablero_uci.js
│  │  │     ├─ tablero_urg.js
│  │  │     └─ vista_paciente.js
│  │  └─ urgencias
│  │     ├─ css
│  │     │  └─ dashboard.css
│  │     └─ js
│  │        └─ dashboard.js
│  ├─ templates
│  │  ├─ base.html
│  │  ├─ cirugia
│  │  │  └─ dashboard.html
│  │  ├─ facturacion
│  │  │  └─ dashboard.html
│  │  ├─ hospitalizacion
│  │  │  ├─ censo.html
│  │  │  ├─ dashboard.html
│  │  │  └─ tablero_uci.html
│  │  ├─ index.html
│  │  ├─ tableros
│  │  │  ├─ dashboard.html
│  │  │  ├─ tablero_cir.html
│  │  │  ├─ tablero_cir_pub.html
│  │  │  ├─ tablero_hos.html
│  │  │  ├─ tablero_uci.html
│  │  │  ├─ tablero_urg.html
│  │  │  └─ vista_paciente.html
│  │  └─ urgencias1
│  │     └─ dashboard.html
│  └─ __init__.py
└─ __pycache__
   └─ run.cpython-311.pyc

```