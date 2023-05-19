const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const cors = require('cors')
const io = new Server(server, {
    maxHttpBufferSize: 5e8,
    cors: {
        origin: "*",
        credentials: true
    }
});
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: false }));
app.set('port', process.env.PORT || 4000)

app.get('/', (req, res) => {
    res.json({
        message: "Test success",
        status: 200
    })
})

app.post('/test', (req, res) => {
    const { orderID, access_token } = req.body
    fetch('https://api-m.sandbox.paypal.com/v2/checkout/orders/' + orderID, {
        headers: {
            'Authorization': 'Bearer ' + access_token
        }
    }).then(( result ) => {
        console.log(result)
    })
})

const TIME_ID = () => {
    let date = new Date()
    let Y = date.getFullYear()
    let M = date.getMonth()
    let D = date.getDate()
    let I = date.getMinutes()
    let S = date.getSeconds()
    return `Payouts_${Y}_${M}${D}${I}${S}`
}

app.post('/payments', (req, res) => {
    const { monto, access_token } = req.body
    // res.send( access_token )
    fetch('https://api-m.sandbox.paypal.com/v1/payments/payouts', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + access_token
        },
        body: JSON.stringify({
            "sender_batch_header": {
                "sender_batch_id": TIME_ID(),
                "email_subject": "¡Tienes un pago!",
                "email_message": "¡Has recibido un pago de Temporary Talk!"
            },
            "items": [
                {
                    "recipient_type": "EMAIL",
                    "amount": { "value": monto, "currency": "USD" },
                    "note": "¡Gracias por usar nuestro servicio!",
                    "sender_item_id": "201403140001",
                    "receiver": "sb-uxxdg15885974@personal.example.com",
                    // "recipient_wallet": "RECIPIENT_SELECTED" 
                }
            ]
        })
    }).then(e => e.json()).then(e => res.json(e))
})

server.listen(app.get('port'), () => {
    console.log(`http://localhost:${app.get('port')}`)
})

let conectados = []
let monetizacion = {}
let disponibilidad = {}
io.on('connection', (socket) => {
    socket.join("sesion-global");
    socket.on('crear-sesion', (dato) => {
        socket.join(dato.usuario)
        if (conectados.find(e => e.usuario === dato.usuario) == undefined) {
            conectados.unshift(dato)
            if (dato.restriccion) {
                dato.restriccion && io.to("sesion-global").emit('usuarios_conectados', conectados.slice(0, 15))
                dato.restriccion && io.to("sesion-global").emit('notificar_conectado', dato.usuario)
            }
            return
        }
        if (dato.restriccion) {
            dato.restriccion && io.to("sesion-global").emit('usuarios_conectados', conectados.slice(0, 15))
        }
        // dato.restriccion && io.to("sesion-global").emit('notificar_conectado', dato.usuario)
    })
    socket.on('buscar-persona', ({ persona, remitente }) => {
        let b = conectados.filter(e => e.usuario.includes(persona) && e.usuario != remitente)
        socket.emit('buscar-persona', b)
    })
    socket.on('cerrar-sesion', (dato) => {
        conectados = conectados.filter(e => e.usuario !== dato)
        socket.broadcast.emit('test', conectados.slice(0, 15))
    })

    // mensajes
    socket.on('enviar-mensaje', ({ destinatario, remitente, mensaje }) => {
        const mensaje_limpio = mensaje.replace(/(<([^>]+)>)/gi, "");
        io.to(destinatario).emit('mensaje', { msj: mensaje_limpio, remitente, destinatario })
        io.to(destinatario).emit('notificar-mensaje', { destinatario, remitente, mensaje: mensaje_limpio })
    })
    socket.on('send-mensaje-image', ({ mensaje, destinatario, remitente }) => {
        socket.to(destinatario).emit('mensaje-imagen', { msj: `<div><img style="max-width: 200px;" src=${mensaje} /></div>`, remitente, destinatario, type: 'image' })
        io.to(destinatario).emit('notificar-mensaje', { destinatario, remitente, mensaje })
    })
    socket.on('send-mensaje-voice', ({ mensaje, destinatario, remitente }) => {
        socket.to(destinatario).emit('mensaje-voice', { msj: mensaje, remitente, destinatario, type: 'audio' })
        io.to(destinatario).emit('notificar-mensaje', { destinatario, remitente, mensaje })
    })
    socket.on('send-mensaje-file', ({ mensaje, destinatario, remitente, name, size }) => {
        socket.to(destinatario).emit('mensaje-file', { msj: mensaje, remitente, destinatario, name, size })
        io.to(destinatario).emit('notificar-mensaje', { destinatario, remitente, mensaje, name, size })
    })

    // llamadas
    socket.on('permiso-shareDisplay', ({ destinatario, remitente }) => {
        socket.to(destinatario).emit('shareDisplay')
    })
    socket.on('cerrar-llamada-remota', ({ destinatario, remitente }) => {
        socket.to(destinatario).emit('cerrar-llamada-remota')
        socket.to(remitente).emit('cerrar-llamada-remota')
    })
    socket.on('usuario-ocupado', ({ destinatario, remitente }) => {
        socket.to(remitente).emit('notificar-usuario-ocupada', { destinatario, remitente })
    })
    socket.on('cancelar-llamada-remota', ({ destinatario, remitente }) => {
        socket.to(remitente).emit('cancelar-llamada-remota', { destinatario, remitente })
        socket.to(destinatario).emit('cancelar-llamada-remota', { destinatario, remitente })
    })
    socket.on('tiempo-de-llamada', ({ destinatario, remitente }) => {
        socket.to(destinatario).emit('tiempo-de-llamada', { destinatario, remitente })
    })

    // monetizacion
    socket.on('monetizacion', ({ remitente, dato }) => {
        monetizacion[remitente] = dato
    })
    socket.on('monetizacion-de-usuario', (dato) => {
        socket.emit('monetizacion', monetizacion[dato])
    })
    socket.on('monetizacion-de-usuario-local', (destinatario) => {
        socket.emit('monetizacion-local', monetizacion[destinatario])
    })
    // Pago
    socket.on('creando-orden-de-pago', ({ destinatario, remitente, monto, tipo }) => {
        socket.to(destinatario).emit('creando-orden-de-pago', { remitente, monto, tipo })
    })
    socket.on('monetizacion-pagada', ({ remitente, destinatario, tipo }) => {
        socket.to(destinatario).emit('monetizacion-pagada', tipo)
    })

    // Disponibilidad
    socket.on('disponibilidad', ({ usuario, remitente, destinatario, status }) => {
        disponibilidad[usuario] = { remitente, destinatario, status }
        socket.emit('disponibilidad', disponibilidad[destinatario])
    })
}) 
