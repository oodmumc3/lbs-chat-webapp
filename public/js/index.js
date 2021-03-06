function getUrlParameter(name) {
    name = name.replace(/[\[]/, '\\[').replace(/[\]]/, '\\]');
    var regex = new RegExp('[\\?&]' + name + '=([^&#]*)');
    var results = regex.exec(location.search);
    return results === null ? '' : decodeURIComponent(results[1].replace(/\+/g, ' '));
}

function getDistanceFromLatLonInKm(lat1, lng1, lat2, lng2) {
    function deg2rad(deg) {
        return deg * (Math.PI/180)
    }

    var R = 6371; // Radius of the earth in km
    var dLat = deg2rad(lat2-lat1);  // deg2rad below
    var dLon = deg2rad(lng2-lng1);
    var a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon/2) * Math.sin(dLon/2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    var d = R * c; // Distance in km
    return d;
}

function makeChatMessage (nickName, message) {
    var msgTemplate = $('#msgTemplate').text();
    msgTemplate = msgTemplate.replace('{{user}}', nickName);
    msgTemplate = msgTemplate.replace('{{message}}', message);

    return msgTemplate;
}
// -------------------------------
// -------------------------------

var SOCKET_ROUTES = {
    _socket: null,
    init: function (socket) {
        this._socket = socket;
        this._onRoutes();
    },
    _onRoutes: function () {
        this._socket.on('userLists', $.proxy(this._onUserLists, this));
        this._socket.on('confirmChat', $.proxy(this._onConfirmChat, this));
        this._socket.on('failRequestChat', $.proxy(this._onFailRequestChat, this));
        this._socket.on('requestChatResult', $.proxy(this._onRequestChatResult, this));
        this._socket.on('successRoomJoin', $.proxy(this._onSuccessRoomJoin, this));
        this._socket.on('receiveMessage', $.proxy(this._onReceiveMessage, this));
        this._socket.on('expireChatRoom', $.proxy(this._onExpireChatRoom, this));
    },
    _onExpireChatRoom: function (data) {
        CHAT_APP.exitChatRoom();
    },
    _onReceiveMessage: function (data) {
        var chatMessage =
            makeChatMessage(data.nickName, data.message);
        $("#chatArea").append(chatMessage);
    },
    _onSuccessRoomJoin: function (data) {
        CHAT_APP.openChatArea(data.roomSeq);
    },
    _onRequestChatResult: function (data) {
        var isChatConfirm = data.isChatConfirm;

        if (!isChatConfirm) {
            alert('상대방이 채팅 수락을 거부하셨습니다.');
            return;
        }

        SOCKET_ROUTES.emit('joinRoom', {roomSeq: data.roomSeq})
    },
    _onFailRequestChat: function (data) {
        alert('채팅 실패: ' + data.message);
    },
    _onConfirmChat: function (data) {
        var requestUserNickName = data.requestUserNickName;
        var isChatConfirm = confirm(requestUserNickName + '님의 대화요청을 수락하시겠습니까?');

        SOCKET_ROUTES.emit('requestChatResult', {
            isChatConfirm: isChatConfirm,
            confirmUserNickName: $('#nickname').val(),
            requestUserNickName: requestUserNickName
        });
    },
    _onUserLists: function (data) {
        var chatUsers = [];

        for (var i = 0; i < data.users.length; i++) {
            var user = data.users[i];
            if (user.nickName === $('#nickname').val()) { continue; }

            chatUsers.push({
                nickName: user.nickName,
                distance: CHAT_APP.calculateDistanceFromMe(
                    { latitude: user.geoLocation.latitude, longitude: user.geoLocation.longitude }
                )
            });
        }

        if (chatUsers.length > 1) {
            chatUsers.sort(function (a, b) {
                return a.distance - b.distance;
            });
        }

        for (var i = 0; i < chatUsers.length; i++) {
            chatUsers[i].distance = chatUsers[i].distance.toFixed(2) + 'km';
        }

       CHAT_APP.drawChatUserList(chatUsers);
    },
    emit: function (name, data) {
        this._socket.emit(name, data);
    }
};

var CHAT_APP = {
    /** * 현재 위치 정보 */
    _location: {
        // 위도
        latitude: null,
        // 경도
        longitude: null
    },
    /** * 입장한 채팅방 번호 */
    _roomSeq: null,
    init: function (socket) {
        this._bindEvents();
    },
    _bindEvents: function () {
        $('#loginButton').click($.proxy(this._onClickLoginBtn, this));
        $('#chatUserList').on('click', $.proxy(this._onClickChatUser, this));
        $('#sendMessage').click(this._onClickSendMessageBtn);
        $('#exitChatRoom').click($.proxy(this._onClickExitChatRoom, this));
    },
    _onClickExitChatRoom: function (e) {
        e.preventDefault();

        if (!this._roomSeq) { return; }
        if (!confirm('채팅방을 나가시겠습니까?')) { return; }

        this.exitChatRoom();
    },
    exitChatRoom: function () {
        SOCKET_ROUTES.emit('exitChatRoom', { roomSeq: this._roomSeq, nickName: $('#nickname').val() });
        this._clearChatWindow();
        this._disableChat();
        this.setRoomSeq(null);

        var chatMessage =
            makeChatMessage('SYSTEM', '채팅방이 종료되었습니다.');
        $("#chatArea").append(chatMessage);
    },
    _onClickSendMessageBtn: function (e) {
        e.preventDefault();

        var nickName = $('#nickname').val();
        var $message = $('#message');
        var message = $message.val();

        SOCKET_ROUTES.emit('sendMessage', {
            message: message,
            roomSeq: CHAT_APP.getRoomSeq(),
            nickName: nickName
        });

        $("#chatArea").append(makeChatMessage(nickName, message));

        $message.val('');
    },
    _onClickChatUser: function (e) {
        var $this = $(e.target);
        var targetNickName = $this.data('nickname');

        if (this._isAlreadyJoinChatRoom()) {
            alert('기존 채팅을 종료후에 시도해주세요.');
            return;
        }
        if (!confirm(targetNickName + '님과 채팅하시겠습니까?')) { return; }

        SOCKET_ROUTES.emit('requestChat', {
            targetNickName: targetNickName,
            requestUserNickName: $('#nickname').val()
        });
    },
    _onClickLoginBtn: function () {
        var nickName = $('#nickname').val();
        if (!nickName) {
            alert('닉네임을 입력해주세요');
            return;
        }

        if (!this._isEnableGeoLocation()) {
            alert('이 브라우저에서는 위치정보(GeoLocation)가 지원되지 않습니다.');
            return;
        }

        var self = this;
        this._setLocationInfo(function () {
            SOCKET_ROUTES.emit('enterNewUser', {
                nickName: nickName,
                geoLocation: {
                    latitude: self._location.latitude,
                    longitude: self._location.longitude
                }
            });
        });

        $('#loginRow').addClass('hide');
        $('#loggedUserName').text(nickName + '님.');
        $('#infoRow, #chatRowContainer').removeClass('hide');
    },
    /**
     * 위치 정보(위도, 경도)를 설정한다.
     * @private
     */
    _setLocationInfo: function (cb) {
        var self = this;
        // 테스트 용도
        if (getUrlParameter('lat') && getUrlParameter('long')) {
            self._location.latitude = getUrlParameter('lat');
            self._location.longitude = getUrlParameter('long');

            console.log('self._location :: ', self._location);
            cb();
            return;
        }

        navigator.geolocation.getCurrentPosition(function(pos) {
            self._location.latitude = pos.coords.latitude;
            self._location.longitude = pos.coords.longitude;

            console.log('self._location :: ', self._location);
            cb();
        });
    },
    /**
     * HTML5 geoLocation 지원여부
     * @return {boolean}
     * @private
     */
    _isEnableGeoLocation: function () {
        return !!navigator.geolocation;
    },
    _disableChat: function () {
        $('#message').val('').attr('disabled', true);
    },
    _enableChat: function () {
        $('#message').val('').attr('disabled', false);
    },
    calculateDistanceFromMe: function (otherGeoLocation) {
        return getDistanceFromLatLonInKm(
            this._location.latitude,
            this._location.longitude,
            otherGeoLocation.latitude,
            otherGeoLocation.longitude
        );
    },
    drawChatUserList: function (chatUsers) {
        console.log('chatUsers :: ', chatUsers);
        var $chatUserList = $('#chatUserList');
        $chatUserList.find('a').remove();

        if (!chatUsers || chatUsers.length === 0) {
            return;
        }

        for (var i = 0; i < chatUsers.length; i++) {
            var user = chatUsers[i];
            var userInfo = user.nickName + ' ('+ user.distance +')';
            var tag = '<a href="#" data-nickname="'+user.nickName+'" class="list-group-item list-group-item-action">'+ userInfo +'</a>';

            $chatUserList.append(tag);
        }
    },
    openChatArea: function (roomSeq) {
        this._clearChatWindow();

        var chatMessage =
            makeChatMessage('SYSTEM', '채팅방에 입장하셨습니다.');
        $("#chatArea").append(chatMessage);

        this.setRoomSeq(roomSeq);
        this._enableChat();
    },
    setRoomSeq: function (roomSeq) {
        this._roomSeq = roomSeq;
    },
    getRoomSeq: function () {
        if (!this._roomSeq) {
            throw Error('Room Seq Has Null Value');
        }
        return this._roomSeq;
    },
    _isAlreadyJoinChatRoom: function () {
        return !!this._roomSeq;
    },
    _clearChatWindow: function () {
        $("#chatArea > div.chat-body").remove();
    }
};

$(function () {
    CHAT_APP.init();
    SOCKET_ROUTES.init(io.connect());
});