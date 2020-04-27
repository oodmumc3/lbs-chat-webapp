/**
 * 채팅 사용자 리스트
 * @type {*[]}
 * @private
 */
const _USERS = [];

const _ROOMS = [];

/**
 * 방번호 시퀀스
 * @type {number}
 */
let ROOM_SEQUENCE = 1;

/**
 * 소켓 라우팅 정보를 설정한다.
 * @param clientSocket 클라이언트 소켓 오브젝트
 * @param io 전체 소켓 오브젝트
 */
exports.init = (clientSocket, io) => {
    clientSocket.on('enterNewUser', data => {
        onEnterNewUser(clientSocket, io, data.nickName, data.geoLocation);
    });

    clientSocket.on('disconnect', () => {
        onDisconnect(clientSocket, io);
    });

    clientSocket.on('requestChat', (data) => {
        onRequestChat(clientSocket, data.requestUserNickName, data.targetNickName);
    });

    clientSocket.on('requestChatResult', (data) => {
        onRequestChatResult(clientSocket, data.confirmUserNickName, data.requestUserNickName, data.isChatConfirm);
    });

    clientSocket.on('joinRoom', (data) => {
        onJoinRoom(clientSocket, io, data.roomSeq);
    });

    clientSocket.on('sendMessage', (data) => {
        onSendMessage(clientSocket, data.message, data.roomSeq, data.nickName);
    });

    clientSocket.on('exitChatRoom', (data) => {
        onExitChatRoom(clientSocket, data.roomSeq, data.nickName);
    });
};

function onEnterNewUser(socket, io, nickName, geoLocation) {
    _USERS.push({ id: socket.id, nickName, geoLocation });
    io.emit('userLists', {users: _USERS});
}

function onDisconnect(socket, io) {
    const disconnectedUser = _USERS.find(user => user.id === socket.id);

    if (disconnectedUser) {
        const room = _ROOMS.find(room => room.users.includes(disconnectedUser.nickName));
        if (room) {
            io.to(room.roomSeq).emit('expireChatRoom');
        }
    }

    if (_USERS.indexOf(disconnectedUser) > -1) {
        _USERS.splice(_USERS.indexOf(disconnectedUser), 1);
    }

    io.emit('userLists', {users: _USERS});
}

/**
 * 상대 사용자에게 대화 요청
 * 요청 대상 사용자가 이미 채팅중이면 실패 메시지를 전송한다.
 *
 * @param socket 클라이언트 소켓
 * @param requestUserNickName 대화 요청 사용자명
 * @param targetNickName 대화 상대 사용자명
 */
function onRequestChat(socket, requestUserNickName, targetNickName) {
    const targetUser = _USERS.find(user => user.nickName === targetNickName.toString());
    if (!targetUser) {
        socket.emit('failRequestChat', { message: '상대 사용자가 존재하지 않습니다.' });
        return;
    }

    const room = _ROOMS.find(room => room.users.includes(targetNickName.toString()));
    console.log('########## room :: ', room);
    if (room) {
        socket.emit('failRequestChat', { message: '상대 사용자가 채팅중입니다.' });
        return;
    }

    socket.to(targetUser.id).emit('confirmChat', { requestUserNickName: requestUserNickName })
}

/**
 * 상대 사용자 채팅 요청에 대한 결과 응답
 * 만약 수락했을시 방번호를 생성하여 요청한 사용자에게 방번호를 넘겨준다.
 *
 * @param socket 클라이언트 소켓
 * @param confirmUserNickName 응답 사용자명
 * @param requestUserNickName 요청 사용자명
 * @param isChatConfirm 수락 여부
 */
function onRequestChatResult(socket, confirmUserNickName, requestUserNickName, isChatConfirm) {
    const requestUser = _USERS.find(user => user.nickName === requestUserNickName.toString());
    if (!requestUser) {
        socket.emit('failRequestChat', { message: '상대 사용자가 존재하지 않습니다.' });
        return;
    }

    const socketData = { isChatConfirm };
    if (isChatConfirm) {
        const roomSeq = ROOM_SEQUENCE++;
        _ROOMS.push({users: [requestUserNickName, confirmUserNickName], roomSeq});

        socket.join(roomSeq);
        socketData.roomSeq = roomSeq;
    }

    socket.to(requestUser.id).emit('requestChatResult', socketData);
}

/**
 * 특정 방 번호를 이용하여 room에 들어간다.
 * @param socket 클라이언트 소켓
 * @param io 전체 소켓 오브젝트
 * @param roomSeq 방번호
 */
function onJoinRoom(socket, io, roomSeq) {
    if (!roomSeq) {
        console.error('!!roomSeq is no exist');
        return;
    }

    socket.join(roomSeq);
    io.to(roomSeq).emit('successRoomJoin', {roomSeq});
}

/**
 * 메시지를 특정 방으로 전송한다.
 * @param socket 클라이언트 소켓
 * @param message 전송될 메시지
 * @param roomSeq 전송될 방번호
 * @param nickName 채팅 전송 사용자명
 */
function onSendMessage(socket, message, roomSeq, nickName) {
    socket.broadcast
        .to(roomSeq)
        .emit('receiveMessage', { message, nickName });

}

function onExitChatRoom(socket, roomSeq, nickName) {
    socket.leave(roomSeq);
    const room = _ROOMS.find(room => room.users.includes(nickName));

    if (room) {
        _ROOMS.splice(_ROOMS.indexOf(room), 1);
        socket.broadcast.to(roomSeq).emit('expireChatRoom');
    }
}
