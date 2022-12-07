const express = require("express");

const bcrypt = require("bcrypt");
const fs = require("fs");
const session = require("express-session");

// Create the Express app
const app = express();

// Use the 'public' folder to serve static files
app.use(express.static("public"));

// Use the json middleware to parse JSON data
app.use(express.json());

// Use the session middleware to maintain sessions
const chatSession = session({
    secret: "game",
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: { maxAge: 300000 }
});
app.use(chatSession);

// This helper function checks whether the text only contains word characters
function containWordCharsOnly(text) {
    return /^\w+$/.test(text);
}

// Handle the /register endpoint
app.post("/register", (req, res) => {
    // Get the JSON data from the body
    const { username, avatar, name, password } = req.body;
    console.log(username, avatar, name, password);
    //
    // D. Reading the users.json file
    //
    const users = JSON.parse(fs.readFileSync("data/users.json"));
    //
    // E. Checking for the user data correctness
    //
    //If any field is empty, return an error
    if (!username || !avatar || !name || !password){
        res.json({ status: "error",
                    error: "Username/avatar/name/password cannot be empty."});
        return;
    }

    //If the username contains invalid characters, return an error
    if (!containWordCharsOnly(username)){
        res.json({ status: "error",
                    error: "Username can only contain underscores, letters or numbers."});
        return;
    }

    //If the username already exists
    if (username in users){
        res.json({ status: "error",
                    error: "Username has already been used."});
                    return;
    }

    //
    // G. Adding the new user account
    //
    // Hash the password
    const hash = bcrypt.hashSync(password, 10);

    //Add the user in the record
    users[username] = { avatar, name, password: hash};
    //
    // H. Saving the users.json file
    //
    fs.writeFileSync("data/users.json", JSON.stringify(users, null, " "));
    //
    // I. Sending a success response to the browser
    //
    res.json({ status: "success"});

    // Delete when appropriate
    //res.json({ status: "error", error: "This endpoint is not yet implemented." });
});

// Handle the /signin endpoint
app.post("/signin", (req, res) => {
    // Get the JSON data from the body
    const { username, password } = req.body;
    //Debug
    //console.log(username, password);
    //
    // D. Reading the users.json file
    //
    const users = JSON.parse(fs.readFileSync("data/users.json"));
    //
    // E. Checking for username/password
    //
    // Username does not exist
    if(!(username in users)){
        res.json({ status: "error",
                    error: "Incorrect username/password."});
        return;
    }

    //Get the user
    const user = users[username];

    // Password is wrong
    if(!bcrypt.compareSync(password, user.password)){
        res.json({ status: "error",
                    error: "Incorrect username/password."});
        return;
    }

    // Save the user info in the current session
    req.session.user = {username, avatar: user.avatar, name: user.name};
    //
    // G. Sending a success response with the user account
    //
    res.json({ status: "success", 
                user: req.session.user});

    // Delete when appropriate
    //res.json({ status: "error", error: "This endpoint is not yet implemented." });
});

// Handle the /validate endpoint
app.get("/validate", (req, res) => {

    //
    // B. Getting req.session.user
    //
    // User has not signed in
    if(!req.session.user){
        res.json({ status: "error",
                    error: "You have not signed in."});
        return;
    }
    //
    // D. Sending a success response with the user account
    //
    res.json({ status: "success", user: req.session.user});
    // Delete when appropriate
    //res.json({ status: "error", error: "This endpoint is not yet implemented." });
});

// Handle the /signout endpoint
app.get("/signout", (req, res) => {

    //
    // Deleting req.session.user
    //
    if(req.session.user){
        delete req.session.user;
    }

    //
    // Sending a success response
    //
    res.json({ status: "success"});
 
    // Delete when appropriate
    //res.json({ status: "error", error: "This endpoint is not yet implemented." });
});


//
// ***** Please insert your Lab 6 code here *****
//
// Create the Socket.IO Server
const { createServer } = require("http");
const { Server } = require("socket.io");
const httpServer = createServer(app);
const io = new Server(httpServer);

// A JS object for storing the online users
const onlineUsers = {};

// Handle the web socket connection
io.on("connection", (socket) => {
    // Add a new user to the online user list
    if (socket.request.session.user) {
        const { username, avatar, name } = socket.request.session.user;
        onlineUsers[username] = { avatar, name};
        //Debug
        //console.log(onlineUsers);

        // Broadcast the signed-in user
        io.emit("add user", JSON.stringify(socket.request.session.user));
    }

    // Set up the disconnect event
    socket.on("disconnect", () => {
        // Remove the user from the online user list
        if(socket.request.session.user) {
            const { username } = socket.request.session.user;
            if(onlineUsers[username])
                delete onlineUsers[username];
            // Debug
            //console.log(onlineUsers);

            // Broadcast the signed-out user
            io.emit("remove user", JSON.stringify(socket.request.session.user));
        }
    });

    // Set up the get users event
    socket.on("get users", () => {
        // Send the online users to the browser
        socket.emit("users", JSON.stringify(onlineUsers));
    });

    // Set up the get messages event
    socket.on("get messages", () => {
        // Send the chatroom mewssages to the browser
        const messages = JSON.parse(fs.readFileSync("data/chatroom.json"));
        socket.emit("messages", JSON.stringify(messages));
    });

    // Set up the post message event
    socket.on("post message", (content) => {
        const chatroom = JSON.parse(fs.readFileSync("data/chatroom.json"));
        const { username, avatar, name } = socket.request.session.user;
        var messageForm = {user: { username, avatar, name}, datetime: new Date(), content: content };
        //add the message to the end of the chatroom
        chatroom.push(messageForm);

        fs.writeFileSync("data/chatroom.json", JSON.stringify(chatroom, null, " "));
        io.emit("add message", JSON.stringify(messageForm));
    });

    // Set the typing message event
    socket.on("type message", () => {
        //Get the name of the user
        //console.log("typing");
        const { username, avatar, name} = socket.request.session.user;
        io.emit("typing user", String(name));
    });
});

// Use the seesion in the Socket.IO server
io.use((socket, next) => {
    chatSession(socket.request, {}, next);
});

// Use a web server to listen at port 8000
httpServer.listen(8000, () => {
    console.log("The chat server has started...");
});
