const _USERS = [];

/**
 * 소켓 라우팅 정보를 설정한다.
 * @param clientSocket 클라이언트 소켓 오브젝트
 */
exports.init = (clientSocket, io) => {
    clientSocket.on('enterNewUser', data => {
        onEnterNewUser(clientSocket, io, data.nickName, data.geoLocation);
    });
};

function onEnterNewUser(socket, io, nickName, geoLocation) {
    _USERS.push({ id: socket.id, nickName, geoLocation });
    io.emit('userLists', {users: _USERS});
}
