import 'dotenv/config'
import express from 'express'
import http from 'http'
import { Server, Socket } from 'socket.io'

const app = express()
const server = http.createServer(app)

const socketIo = new Server(server)

type User = {
  id: string
  socketId: string
  username: string
  isAdmin: boolean
  roomCode: string
  vote: number | null
}

type Room = {
  roomCode: string
  users: User[]
}

const allSockets: string[] = []
const allUsers: User[] = []
const rooms: Room[] = []

function removeSocket(id: string) {
  let socketIndex = ''

  for (const index in allSockets) {
    if (allSockets[index] === id)
      socketIndex = index
  }

  if (!socketIndex)
    return

  allSockets.splice(Number(socketIndex), 1)
}

function createRoomCode(): string {
  let roomCode = ''
  for (let i = 0; i < 3; i++) {
    roomCode = roomCode + Math.floor(Math.random() * 10)
  }

  for (const room of rooms) {
    if (room.roomCode === roomCode)
      return createRoomCode()
  }

  return roomCode
}

function removeRoom(room: Room) {
  let roomIndex = ''

  for (const index in rooms) {
    if (rooms[index].roomCode === room.roomCode)
      roomIndex = index
  }

  if (!roomIndex)
    return

  rooms.splice(Number(roomIndex), 1)
}

function removeUser(socketId: string) {
  let userIndex = ''

  for (const index in allUsers) {
    if (allUsers[index].socketId === socketId)
      userIndex = index
  }

  if (!userIndex)
    return

  rooms.splice(Number(userIndex), 1)
}

function addUserInRoom(user: User) {

  for (const index in rooms) {
    if (rooms[index].roomCode === user.roomCode) {
      rooms[index].users.push(user)
      return rooms[index]
    }
  }

  throw new Error("Usuário com roomCode inválida");
}

function updateVote(user: User, vote: number | null) {
  for (const index in rooms) {
    if (rooms[index].roomCode === user.roomCode) {

      for (const idx in rooms[index].users) {
        if (rooms[index].users[idx].socketId === user.socketId) {
          rooms[index].users[idx].vote = vote
        }
      }
    }
  }
}

function getRoom(roomCode: string) {
  return rooms.find(room => room.roomCode === roomCode)
}

socketIo.on('connection', (socket: Socket) => {

  socket.on('disconnect', () => {
    removeSocket(socket.id)

    const userFound = allUsers.find(user => user.socketId === socket.id)

    if (userFound) {
      rooms.forEach(room => {
        if (room.roomCode === userFound.roomCode) {
          const userFiltered = room.users.filter(user => user.socketId !== userFound.socketId)
          room.users = userFiltered

          socketIo.to(room.roomCode).emit('Room_Users', room.users)

          if (room.users.length === 0) {
            removeRoom(room)
          }
        }
      })
    }

    removeUser(socket.id)
  })

  socket.on('Create_Room', userAdminData => {

    const userAdmin: User = {
      id: socket.id,
      socketId: socket.id,
      username: userAdminData.username,
      isAdmin: userAdminData.isAdmin,
      roomCode: createRoomCode(),
      vote: null
    }

    const room: Room = {
      roomCode: userAdmin.roomCode,
      users: []
    }

    room.users.push(userAdmin)

    allUsers.push(userAdmin)
    rooms.push(room)

    socket.join(room.roomCode)
    socket.emit('Me', userAdmin)
    socketIo.to(room.roomCode).emit('Room_Users', room.users)
  })

  socket.on('Join_Room', userData => {
    const user: User = {
      id: socket.id,
      socketId: socket.id,
      username: userData.username,
      isAdmin: false,
      roomCode: userData.roomCode,
      vote: null
    }

    allUsers.push(user)

    const room = addUserInRoom(user)

    socket.join(user.roomCode)
    socket.emit('Me', user)
    socketIo.to(room.roomCode).emit('Room_Users', room.users)
  })

  socket.on("To_Vote", (vote: number) => {
    const userFound = allUsers.find(user => user.socketId === socket.id)

    if (!userFound || !userFound.roomCode) return

    updateVote(userFound, vote)

    const room = getRoom(userFound.roomCode)

    if (!room)
      return

    socketIo.to(userFound.roomCode).emit('Who_Voted', userFound)
    socketIo.to(userFound.roomCode).emit('Room_Users', room.users)
  })

  socket.on('Show_Votes', (isVisible: boolean) => {
    const userFound = allUsers.find(user => user.socketId === socket.id)

    if (!userFound || !userFound.roomCode) return

    socketIo.to(userFound.roomCode).emit('Change_Visibility_Votes', isVisible)
  })

  socket.on('Try_Change_Vote', () => {
    const userFound = allUsers.find(user => user.socketId === socket.id)

    if (!userFound || !userFound.roomCode) return

    socketIo.to(userFound.roomCode).emit('Who_Try_Change_Voted', userFound)
  })

  socket.on('Reset_Votes', () => {

    const userFound = allUsers.find(user => user.socketId === socket.id)

    if (!userFound || !userFound.roomCode) return

    const roomFound = rooms.find(room => room.roomCode === userFound.roomCode)

    if (!roomFound) return

    roomFound.users.forEach(user => {
      updateVote(user, null)
    })

    const roomUpdated = getRoom(roomFound.roomCode)

    socketIo.to(userFound.roomCode).emit('Room_Users', roomUpdated?.users)
    socketIo.to(userFound.roomCode).emit('Is_Redefined_Votes')
  })
})

const PORT = process.env.PORT || 3001

server.listen(PORT, () => console.log(`Server started at port ${PORT}`))
