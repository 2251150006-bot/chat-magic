import React, { useEffect, useState, useRef } from 'react';
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/database';

const firebaseConfig = {
  apiKey: 'AIzaSyBbpvdRorOfPJIEwl3fS4WMXeTYKXWm0rs',
  authDomain: 'chat-app-demo-98c63.firebaseapp.com',
  projectId: 'chat-app-demo-98c63',
  storageBucket: 'chat-app-demo-98c63.firebasestorage.app',
  messagingSenderId: '521204025568',
  appId: '1:521204025568:web:baa74b02791d70e88f2885',
  measurementId: 'G-0FET3WDGCT',
  databaseURL: 'https://chat-app-demo-98c63-default-rtdb.firebaseio.com/'
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db = firebase.database();

export function App() {
  const [user, setUser] = useState<firebase.User | null>(null);
  const [currentRoomId, setCurrentRoomId] = useState('global');
  const [currentRoomName, setCurrentRoomName] = useState('🌐 Phòng chung');
  const [currentAdminId, setCurrentAdminId] = useState<string | null>(null);
  const [onlineUsersData, setOnlineUsersData] = useState<any>({});
  const [messages, setMessages] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [messageInput, setMessageInput] = useState('');
  
  // States cho Form Đăng nhập / Đăng ký
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [regUsername, setRegUsername] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  
  const messageListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setUser(user);
      if (user) {
        setupPresence(user);
        loadGroups();
        switchRoom('global', '🌐 Phòng chung', null);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    }
  }, [messages]);

  async function handleSignUp() {
    const email = regEmail;
    const password = regPassword;
    const name = regUsername.trim();
    if (!email || !password || !name) {
      alert('Nhập đủ thông tin!');
      return;
    }
    try {
      const nameCheck = await db.ref('usernames/' + name).once('value');
      if (nameCheck.exists()) {
        alert('Tên đã bị trùng!');
        return;
      }
      const res = await auth.createUserWithEmailAndPassword(email, password);
      if (res.user) {
        await res.user.updateProfile({
          displayName: name
        });
        await db.ref('usernames/' + name).set(res.user.uid);
        await db.ref('users/' + res.user.uid).set({
          name: name,
          email: email
        });
        alert('Đăng ký xong! Bạn có thể đăng nhập ngay bây giờ.');
        setIsLoginMode(true); // Chuyển về màn hình đăng nhập sau khi đăng ký thành công
      }
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function handleLogin() {
    const email = regEmail;
    const password = regPassword;
    if (!email || !password) {
      alert('Vui lòng nhập Email và Mật khẩu!');
      return;
    }
    try {
      await auth.signInWithEmailAndPassword(email, password);
    } catch (e: any) {
      alert("Đăng nhập thất bại: " + e.message);
    }
  }

  function handleLogout() {
    if (auth.currentUser) {
      db.ref('status/' + auth.currentUser.uid).remove();
    }
    auth.signOut();
  }

  function createGroup() {
    const name = prompt('Nhập tên nhóm mới:');
    if (!name) return;
    const newGroupRef = db.ref('groups').push();
    newGroupRef.set({
      name: name,
      admin: auth.currentUser?.uid,
      members: {
        [auth.currentUser?.uid || '']: true
      }
    });
  }

  async function leaveCurrentGroup() {
    if (currentRoomId === 'global') return;
    if (!confirm(`Bạn có chắc chắn muốn rời khỏi nhóm này không?`)) return;
    try {
      await db.
        ref(`groups/${currentRoomId}/members/${auth.currentUser?.uid}`).
        remove();
      alert('Đã rời nhóm thành công!');
      switchRoom('global', '🌐 Phòng chung', null);
    } catch (e: any) {
      alert('Lỗi: ' + e.message);
    }
  }

  async function deleteCurrentGroup() {
    if (currentRoomId === 'global') return;
    if (currentAdminId !== auth.currentUser?.uid) {
      alert('Chỉ Trưởng nhóm mới có quyền này!');
      return;
    }
    if (
      !confirm(
        `Bạn có CHẮC CHẮN muốn giải tán nhóm này không?\nToàn bộ tin nhắn và thành viên sẽ bị xóa vĩnh viễn!`
      ))

      return;
    try {
      await db.ref(`groups/${currentRoomId}`).remove();
      await db.ref(`messages/${currentRoomId}`).remove();
      alert('Đã giải tán nhóm thành công!');
      switchRoom('global', '🌐 Phòng chung', null);
    } catch (e: any) {
      alert('Lỗi: ' + e.message);
    }
  }

  function loadGroups() {
    db.ref('groups').on('value', (snapshot) => {
      const groupsList: any[] = [];
      let groupStillExists = false;
      snapshot.forEach((child) => {
        const g = child.val();
        if (g.members && g.members[auth.currentUser?.uid || '']) {
          groupsList.push({
            id: child.key,
            name: g.name,
            admin: g.admin
          });
          if (currentRoomId === child.key) groupStillExists = true;
        }
      });
      setGroups(groupsList);
      if (currentRoomId !== 'global' && !currentRoomId.includes('_') && !groupStillExists) {
        switchRoom('global', '🌐 Phòng chung', null);
      }
    });
  }

  function switchRoom(id: string, name: string, adminId: string | null) {
    setCurrentRoomId(id);
    setCurrentRoomName(name);
    setCurrentAdminId(adminId);
    loadMessages(id);
  }

  function startPrivateChat(targetUid: string, targetName: string) {
    if (!auth.currentUser) return;
    const myUid = auth.currentUser.uid;
    const privateRoomId = myUid < targetUid ? `${myUid}_${targetUid}` : `${targetUid}_${myUid}`;
    switchRoom(privateRoomId, `💬 Chat với ${targetName}`, null);
  }

  function loadMessages(roomId: string) {
    setMessages([]);
    db.ref('messages/' + roomId).off();
    db.ref('messages/' + roomId).on('child_added', (snap) => {
      const m = snap.val();
      setMessages((prev) => [...prev, m]);
    });
  }

  function sendMessage() {
    if (!messageInput.trim()) return;
    db.ref('messages/' + currentRoomId).push({
      name: auth.currentUser?.displayName,
      text: messageInput,
      uid: auth.currentUser?.uid,
      time: new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
      })
    });
    setMessageInput('');
  }

  function setupPresence(user: firebase.User) {
    const myStatusRef = db.ref('status/' + user.uid);
    db.ref('.info/connected').on('value', (snap) => {
      if (snap.val()) {
        myStatusRef.onDisconnect().remove();
        myStatusRef.set({
          name: user.displayName,
          status: 'online'
        });
      }
    });
    db.ref('status').on('value', (snap) => {
      setOnlineUsersData(snap.val() || {});
    });
  }

  async function addMemberFromList(uid: string, name: string) {
    try {
      await db.ref(`groups/${currentRoomId}/members/${uid}`).set(true);
      alert(`Đã thêm ${name} vào nhóm!`);
    } catch (e: any) {
      alert('Lỗi: ' + e.message);
    }
  }

  async function removeMemberFromList(uid: string, name: string) {
    if (!confirm(`Bạn có chắc muốn xóa ${name} khỏi nhóm này?`)) return;
    try {
      await db.ref(`groups/${currentRoomId}/members/${uid}`).remove();
      alert(`Đã xóa ${name} khỏi nhóm!`);
    } catch (e: any) {
      alert('Lỗi: ' + e.message);
    }
  }

  const isGroup = currentRoomId !== 'global' && !currentRoomId.includes('_');
  const iAmAdmin = currentAdminId === auth.currentUser?.uid;

  if (!user) {
    return (
      <div className="min-h-screen w-full bg-gradient-to-br from-blue-600 via-blue-500 to-green-500 flex items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-to-br from-blue-400/30 to-transparent rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-gradient-to-tl from-green-400/30 to-transparent rounded-full blur-3xl animate-pulse delay-1000"></div>
        </div>

        <div className="w-full max-w-md relative z-10">
          <div className="glass-card bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl p-8 border border-white/20">
            <div className="text-center mb-8">
              <div className="inline-block p-4 bg-gradient-to-br from-blue-600 to-green-500 rounded-2xl mb-4 shadow-lg transform hover:scale-105 transition-transform duration-300">
                <svg
                  className="w-12 h-12 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-green-500 bg-clip-text text-transparent mb-2">
                {isLoginMode ? 'Chào mừng trở lại!' : 'Tạo tài khoản mới'}
              </h1>
              <p className="text-gray-500 font-medium text-sm">
                {isLoginMode ? 'Đăng nhập để kết nối với bạn bè' : 'Tham gia cùng chúng tôi ngay hôm nay'}
              </p>
            </div>

            <div className="space-y-4">
              {/* Chỉ hiện ô Username khi ở màn hình Đăng ký */}
              {!isLoginMode && (
                <div className="relative group">
                  <input
                    type="text"
                    placeholder="Tên người dùng (Duy nhất)"
                    value={regUsername}
                    onChange={(e) => setRegUsername(e.target.value)}
                    className="w-full px-5 py-4 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 transition-all duration-300 bg-white/80 backdrop-blur-sm group-hover:border-gray-300" />
                </div>
              )}
              
              <div className="relative group">
                <input
                  type="email"
                  placeholder="Email"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  className="w-full px-5 py-4 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 transition-all duration-300 bg-white/80 backdrop-blur-sm group-hover:border-gray-300" />
              </div>
              
              <div className="relative group">
                <input
                  type="password"
                  placeholder="Mật khẩu"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && (isLoginMode ? handleLogin() : handleSignUp())}
                  className="w-full px-5 py-4 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 transition-all duration-300 bg-white/80 backdrop-blur-sm group-hover:border-gray-300" />
              </div>

              {isLoginMode ? (
                <button
                  onClick={handleLogin}
                  className="w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white py-4 rounded-xl font-bold hover:from-blue-700 hover:to-blue-800 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-[1.02] active:scale-[0.98] mt-2">
                  ĐĂNG NHẬP
                </button>
              ) : (
                <button
                  onClick={handleSignUp}
                  className="w-full bg-gradient-to-r from-green-500 to-green-600 text-white py-4 rounded-xl font-bold hover:from-green-600 hover:to-green-700 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-[1.02] active:scale-[0.98] mt-2">
                  ĐĂNG KÝ
                </button>
              )}
              
              {/* Nút chuyển đổi chế độ */}
              <div className="text-center mt-6 pt-4 border-t border-gray-100">
                <p className="text-gray-600 text-sm">
                  {isLoginMode ? "Chưa có tài khoản? " : "Đã có tài khoản? "}
                  <button 
                    onClick={() => setIsLoginMode(!isLoginMode)}
                    className="font-bold text-blue-600 hover:text-blue-800 hover:underline transition-colors">
                    {isLoginMode ? "Đăng ký ngay" : "Đăng nhập"}
                  </button>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex overflow-hidden bg-gradient-to-br from-gray-50 to-blue-50/30">
      {/* Sidebar */}
      <div className="w-80 bg-white/80 backdrop-blur-xl border-r border-gray-200/50 flex flex-col shadow-xl">
        <div className="p-5 border-b border-gray-200/50 flex items-center justify-between bg-gradient-to-r from-blue-600 via-blue-600 to-green-500 shadow-lg">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16" />
            </svg>
            Danh sách
          </h2>
          <button
            onClick={createGroup}
            className="bg-white/20 backdrop-blur-sm text-white px-4 py-2.5 rounded-lg text-sm font-bold hover:bg-white/30 transition-all duration-300 shadow-md hover:shadow-lg border border-white/30 transform hover:scale-105 active:scale-95">
            + Nhóm
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {/* Groups List */}
          <div className="p-4">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider px-3 mb-3 flex items-center gap-2">
              <div className="w-1 h-4 bg-gradient-to-b from-blue-600 to-green-500 rounded-full"></div>
              Nhóm của tôi
            </h3>

            <div
              onClick={() => switchRoom('global', '🌐 Phòng chung', null)}
              className={`px-4 py-3.5 rounded-xl cursor-pointer transition-all duration-300 mb-2 group ${currentRoomId === 'global' ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-500/30 scale-[1.02]' : 'hover:bg-gray-100/80 text-gray-700 hover:shadow-md hover:scale-[1.01]'}`}>
              <div className="flex items-center gap-3">
                <span className="text-xl">🌐</span>
                <span className="font-semibold">Phòng chung</span>
              </div>
            </div>

            {groups.map((group) =>
              <div
                key={group.id}
                onClick={() =>
                  switchRoom(group.id, `📁 ${group.name}`, group.admin)
                }
                className={`px-4 py-3.5 rounded-xl cursor-pointer transition-all duration-300 mb-2 group ${currentRoomId === group.id ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-500/30 scale-[1.02]' : 'hover:bg-gray-100/80 text-gray-700 hover:shadow-md hover:scale-[1.01]'}`}>
                <div className="flex items-center gap-3">
                  <span className="text-xl">📁</span>
                  <span className="font-semibold">{group.name}</span>
                </div>
              </div>
            )}
          </div>

          {/* Online Users */}
          <div className="p-4 border-t border-gray-200/50">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider px-3 mb-3 flex items-center gap-2">
              <div className="w-1 h-4 bg-gradient-to-b from-green-500 to-green-600 rounded-full"></div>
              Người đang Online
            </h3>

            {Object.entries(onlineUsersData).map(
              ([uid, userData]: [string, any]) => {
                const isMe = uid === auth.currentUser?.uid;
                const showGroupActions = isGroup && iAmAdmin && !isMe;
                
                return (
                  <div
                    key={uid}
                    className="px-4 py-3 rounded-xl hover:bg-gray-100/60 transition-all duration-300 flex items-center gap-3 mb-2 group hover:shadow-sm">
                    
                    <div className="relative">
                      <div className="w-2.5 h-2.5 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex-shrink-0 shadow-lg shadow-green-500/50"></div>
                      <div className="absolute inset-0 w-2.5 h-2.5 bg-green-400 rounded-full animate-ping opacity-75"></div>
                    </div>
                    
                    <span className="text-sm text-gray-700 flex-1 truncate font-medium">
                      {userData.name} {isMe ? '(Bạn)' : ''}
                    </span>

                    <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 ml-auto">
                      {!isMe && (
                         <button
                           onClick={() => startPrivateChat(uid, userData.name)}
                           className="px-2.5 py-1.5 bg-gradient-to-r from-purple-500 to-purple-600 text-white text-xs rounded-lg hover:from-purple-600 hover:to-purple-700 transition-all duration-300 font-semibold shadow-md hover:shadow-lg transform hover:scale-105 active:scale-95"
                         >
                           Chat
                         </button>
                      )}

                      {showGroupActions && (
                        <>
                          <button
                            onClick={() => addMemberFromList(uid, userData.name)}
                            className="px-2.5 py-1.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white text-xs rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all duration-300 font-semibold shadow-md hover:shadow-lg transform hover:scale-105 active:scale-95">
                            Thêm
                          </button>
                          <button
                            onClick={() => removeMemberFromList(uid, userData.name)}
                            className="px-2.5 py-1.5 bg-gradient-to-r from-red-500 to-red-600 text-white text-xs rounded-lg hover:from-red-600 hover:to-red-700 transition-all duration-300 font-semibold shadow-md hover:shadow-lg transform hover:scale-105 active:scale-95">
                            Xóa
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              }
            )}
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Chat Header */}
        <div className="bg-white/90 backdrop-blur-xl border-b border-gray-200/50 px-6 py-5 flex items-center justify-between shadow-lg">
          <div>
            <h2 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-green-500 bg-clip-text text-transparent">
              {currentRoomName}
            </h2>
            {isGroup && iAmAdmin &&
              <div className="flex items-center gap-3 mt-2">
                <span className="text-xs font-bold text-orange-600 bg-gradient-to-r from-orange-100 to-yellow-100 px-3 py-1.5 rounded-lg shadow-sm border border-orange-200">
                  👑 Trưởng nhóm
                </span>
                <button
                  onClick={deleteCurrentGroup}
                  className="text-xs bg-gradient-to-r from-red-500 to-red-600 text-white px-4 py-1.5 rounded-lg hover:from-red-600 hover:to-red-700 transition-all duration-300 font-bold shadow-md hover:shadow-lg transform hover:scale-105 active:scale-95">
                  Giải tán nhóm
                </button>
              </div>
            }
          </div>

          <div className="flex gap-3">
            {isGroup && !iAmAdmin &&
              <button
                onClick={leaveCurrentGroup}
                className="px-5 py-2.5 bg-gradient-to-r from-red-50 to-red-100 text-red-600 rounded-xl text-sm font-bold hover:from-red-100 hover:to-red-200 transition-all duration-300 border-2 border-red-200 hover:border-red-300 shadow-md hover:shadow-lg transform hover:scale-105 active:scale-95">
                Rời nhóm
              </button>
            }
            <button
              onClick={handleLogout}
              className="px-5 py-2.5 bg-gradient-to-r from-gray-100 to-gray-200 text-gray-700 rounded-xl text-sm font-bold hover:from-gray-200 hover:to-gray-300 transition-all duration-300 shadow-md hover:shadow-lg transform hover:scale-105 active:scale-95">
              Đăng xuất
            </button>
          </div>
        </div>

        {/* Messages */}
        <div
          ref={messageListRef}
          className="flex-1 overflow-y-auto p-6 space-y-4 bg-gradient-to-br from-gray-50/50 to-blue-50/30 custom-scrollbar">
          {messages.map((msg, idx) => {
            const isMe = msg.uid === auth.currentUser?.uid;
            return (
              <div
                key={idx}
                className={`flex ${isMe ? 'justify-end' : 'justify-start'} animate-fade-in`}>
                <div
                  className={`max-w-md ${isMe ? 'items-end' : 'items-start'} flex flex-col`}>
                  <span className="text-xs text-gray-500 mb-1.5 px-2 font-medium">
                    {isMe ? 'Bạn' : msg.name} • {msg.time}
                  </span>
                  <div
                    className={`px-5 py-3 rounded-2xl shadow-md hover:shadow-lg transition-all duration-300 ${isMe ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-br-md' : 'bg-white text-gray-800 rounded-bl-md border border-gray-100'}`}>
                    <p className="leading-relaxed">{msg.text}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Input Area */}
        <div className="bg-white/90 backdrop-blur-xl border-t border-gray-200/50 p-5 flex gap-3 shadow-lg">
          <input
            type="text"
            placeholder="Nhập tin nhắn..."
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
            className="flex-1 px-6 py-4 border-2 border-gray-200 rounded-2xl focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 transition-all duration-300 bg-white shadow-sm hover:shadow-md" />
          <button
            onClick={sendMessage}
            className="px-10 py-4 bg-gradient-to-r from-blue-600 to-green-500 text-white rounded-2xl font-bold hover:from-blue-700 hover:to-green-600 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105 active:scale-95 flex items-center gap-2">
            <span>Gửi</span>
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}