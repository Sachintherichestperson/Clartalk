const express = require("express");
const router = express.Router();
const User = require("../mongoose/user-mongo");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const {userregister, loginuser, logout} = require("../controller/authcontroller");
const isloggedin = require("../middleware/isloggedin");
const podcastsmongoose = require("../mongoose/podcasts-mongo");
const videomongoose = require("../mongoose/video-mongo");
const liveMongo = require("../mongoose/live-mongo");
const communityMongo = require("../mongoose/community-mongo");
const competitionMongo = require("../mongoose/competition-mongo");
const upload = require("../config/multer");
const schedule = require("node-schedule");
const Socket  = require("socket.io");
const Razorpay = require("razorpay");
const userMongo = require("../mongoose/user-mongo");

router.get("/register", (req, res) => {                                                                      //register page
    let err = req.flash("key")
    res.render("Register", { err });
    console.log(err)
});

router.post("/register", userregister)                                                                     //register page--Uploader

router.get("/login", function(req, res){                                                                   //Login Page
    let err = req.flash("usernot")
    res.render("login", {err})
});

router.post("/login", loginuser)                                                                           //Login Page-Uploader

router.get("/",isloggedin,async function(req, res){                                                        // front page
  try{
    const user = await User.findOne({email: req.user.email}).populate("requests").populate( "Sender" );
    const vedios = await liveMongo.find({ status: "accept"})
    res.render("front-page", {vedios, user})
  }catch(err){
    res.status(404).send(err);
  }
  
});

router.get("/debate",isloggedin,async function(req, res){                                                  //debate page
  const user = await User.findOne({email: req.user.email}).populate("requests");
  let vedios = await videomongoose.find({});
  res.render("debate", { vedios,user });
});

router.get("/debate/:id",isloggedin, async function(req, res){                                             //debate video-player
  try{
    let vedios = await videomongoose.findById(req.params.id)
    .populate({
        path: "creator",
        select: "username followers Rankpoints"
    });
    const creator = await User.findById(vedios.creator[0]._id).populate("Rankpoints")
    


    let user = await User.findOne({email: req.user.email });
    
    const followerscount = vedios.creator[0].followers;
    const follower = followerscount.length;
    const isFollowing = followerscount.includes(req.user._id);
    
    if (!vedios.viewedBy.includes(req.user._id)) {
      vedios.Views += 1;
      vedios.viewedBy.push(req.user._id);
      await vedios.save();

      const points = 10;
      creator.Rankpoints += points;
      await creator.save();

      await User.updateRanks();
    }


    const suggestions = await videomongoose.find({ _id: { $ne: vedios._id } }).limit(5).populate({
        path: "creator",
        select: "username"
    })
    
    res.render("vedioplayer", {vedios, suggestions, currentRoute: "debate", follower, isFollowing, user });
  }catch(err){
    res.send(err)
    console.log(err)
  }
});

router.get("/podcast", isloggedin, async function(req, res){                                               //podcast section Page
  const user = await User.findOne({email: req.user.email}).populate("requests")
  let vedios = await podcastsmongoose.find({});
  res.render("podcast", { vedios, user });
});
 
router.get("/podcast/:id",isloggedin, async function(req, res){                                            //podcast video-player
    try{
      let user = await User.findOne({email: req.user.email });
    let vedios = await podcastsmongoose.findById(req.params.id)
    .populate({
        path: "creator",
        select: "username followers"
    });

    const creator = await User.findById(vedios.creator[0]._id).populate("Rankpoints")

    const followerscount = vedios.creator[0].followers;
    const follower = followerscount.length;
    const isFollowing = followerscount.includes(req.user._id);
    

    if (!vedios.viewedBy.includes(user._id)) {
      vedios.Views += 1;
      vedios.viewedBy.push(user._id);
      await vedios.save();

      const points = 10;
      creator.Rankpoints += points;
      await creator.save();

      await User.updateRanks();
    }


    const suggestions = await podcastsmongoose.find({ _id: { $ne: vedios._id } }).limit(5).populate({
      path: "creator",
      select: "username"
  });


    res.render("vedioplayer", {vedios, suggestions, currentRoute: "podcast", follower, isFollowing, user});

    }catch(err){
      res.send(err)
       console.log(err)
    }
});

router.get("/community",isloggedin,async function(req, res){                                               //community Page
  const communities = await communityMongo.find().populate({
    path: "createdBy",
    select: "username"
  });

  const user = await User.findOne({email: req.user.email}).populate("requests");
  res.render("community", { communities, user } );
});

router.get("/logout", logout);                                                                             //Logout route

router.get("/community-chat/:id",isloggedin ,async function(req, res){                                    //community-chat/:id Page
  try{
    const community = await communityMongo.findById(req.params.id);
    const user = await User.findOne({email: req.user.email});
    res.render("chat", {community, user});
  }catch(err){
    res.send(err)
    console.log(err.message)
  }
});

router.get("/profile",isloggedin,async function(req, res){                                                //profile Page
  const user = await User.findOne({email: req.user.email}).populate("followers").populate("vedio").populate("podcast").populate("profile").populate("requests");

  const videoCount = user.vedio ? user.vedio.length : 0;
  const debateCount = user.podcast ? user.podcast.length : 0;
  const totalContent = videoCount + debateCount;

  const profile = user.profile;
  
  const followerCount = user.followers ? user.followers.length : 0;

  res.render("profile", { user, totalContent, followerCount, profile });
});

router.get("/uploaded-content", isloggedin, async function (req, res) {                                   //uploaded-content Page
  try {
    const user = await User.findOne({ email: req.user.email })
              .populate({
                  path: "vedio",
                  select: "title description createdAt Thumbnail Views"
              })
              .populate({
                  path: "podcast",
                  select: "title description createdAt Thumbnail Views"
              });
    
          if (!user) {
              return res.status(404).send("User not found");
          }
    
    
          // Add a `type` property to distinguish between videos and podcasts
          const vedios = [
              ...user.vedio.map(v => ({ ...v.toObject(), type: "debate" })),
              ...user.podcast.map(p => ({ ...p.toObject(), type: "podcast" }))
          ];

    res.render("Uploaded-content-profile", { vedios, user });
  } catch (err) {
    console.error(err);
    res.status(500).send("An error occurred while fetching data.");
  }
});

router.get("/My-World",isloggedin, async function(req, res){                                             //Myworld Page
  const communities = await User.findOne({email: req.user.email}).populate("communities");
  res.render("Myworld", { communities })
});

router.get("/SentRequests",isloggedin, async function (req, res) {                                       //Sent Requests Page
  const contents = await User.findOne({ email: req.user.email }).populate({
    path: "Sender",
    select: "OpponentName requestId",
    populate: {
      path: "OpponentName",
      select: "username"
    }
  });

  res.render("Sentrequests", { contents });
});

router.get("/update-route/:id",isloggedin, async function(req, res){                                      // update-route/:id  Page
  const profileupdate = await User.findOne({ email: req.user.email }).populate("profile");
  console.log(profileupdate)
  res.render("update-profile", { profileupdate })
});

router.post("/update-profile", isloggedin, upload.single("profile"), async function (req, res) {          // update-profile   Page
  try {
    let { username } = req.body;
    let profileImageBuffer = req.file ? req.file.buffer : null; // Get the file buffer or null if no file is uploaded

    const user = await User.findOne({ email: req.user.email });
    if (profileImageBuffer) {
      user.profile = profileImageBuffer;  // Save the buffer data
    }
    user.username = username;

    await user.save();
    res.redirect("/profile");
  } catch (err) {
    res.status(404).send(err);
  }
});

router.get("/LeaderBoard", isloggedin, async function (req, res) { // LeaderBoard Page
  try {
    const user = await User.findOne({ email: req.user.email });

    // Fetch top users sorted by Rankpoints in descending order
    const LeaderBoards = await User.find().sort({ Rankpoints: -1 }).limit(10);

    // Assign ranks to users
    LeaderBoards.forEach((creator, index) => {
      creator.Rank = index + 1; // Rank starts from 1
    });


    res.render("leaderBoard", { user, LeaderBoards });
  } catch (err) {
    console.log(err);
    res.status(500).send("Internal Server Error");
  }
});

router.post("/Join-community/:id",isloggedin,async (req, res) => {                                 // Join-community/:id Page
  try{
      const community = await communityMongo.findById(req.params.id);

      if(!community.members.includes(req.user._id)){
        community.members.push(req.user._id);
        await community.save();
      }else{
       res.send("Already a member");
      }

      const redirectUrl = req.get("Referrer") || "/";
      res.redirect(redirectUrl);

  }catch(err){
    console.log(err);
  }
});

router.post("/Community/:id/payment",isloggedin,async (req, res) => {                                 // Join-community/:id Page
  try{
      const community = await communityMongo.findById(req.params.id);
      res.render("payment-for-community", { community });
  }catch(err){
    console.log(err);
  }
});

router.get("/Members/:id",isloggedin,async (req, res) => {                                                    // Members/:id Page
  const members = await communityMongo.findById(req.params.id).populate({
    path: "members",
    select: "username"
  });

  res.render("Members", {members});
});

router.get("/Send-merge-request",isloggedin,async function(req, res){
  res.render("Send-merge-request")
});

router.get("/settings",isloggedin,async function (req, res) {                                                  //settings   Page
  res.render("settings");
});

router.get("/video-player/:id",isloggedin, async function (req, res) {
  try{
     
  }catch(err){
    res.status("500").send("Error Occured", err)
  }
});

router.get('/payment-for/:id/payment/:id',isloggedin, async (req, res) => {
    try {
      const Live = await liveMongo.findById(req.params.id)

      res.render("payment", { Live });
    } catch (error) {
        console.error('Error creating payment:', error);
        res.status(500).send('Something went wrong. Try again later.');
    }
});

router.get("/live-content-applying-page/:id",isloggedin, async function(req, res){                       //live-content-applying-page/:id  Page
  try{
    const Live = await liveMongo.findById(req.params.id).populate("creator");

    const viewers = await liveMongo.findById(req.params.id).populate({
      path: "BookingDoneBy",
      select: "username"
    });
    const Booking = viewers.BookingDoneBy.some(id => id.equals(req.user.id))

    const followerscount = Live.creator[0].followers;
    const follower = followerscount.length;
  
    const suggestions = await liveMongo.find({ _id: { $ne: Live._id } }).limit(5).populate({
      path: "creator",
      select: "username"
  });
  const isFollowing = followerscount.includes(req.user._id);

  let user = await User.findOne({email: req.user.email });

  res.render("Livedebate-player", { Live, follower, suggestions, currentRoute: "live-content-applying-page", isFollowing, user, Booking });
  }catch(err){
        res.send("404").status("Page Not Found");
  }
});

router.post('/watch-time', isloggedin, async (req, res) => {
  let { watchTime, videoId, videoType } = req.body; // Get watch time, video ID, and video type from the request body

  try {
      // Ensure watchTime is a number
      watchTime = parseFloat(watchTime);

      if (isNaN(watchTime)) {
          return res.status(400).json({ message: 'Invalid watch time value.' });
      }

      const user = await User.findOne({ email: req.user.email });

      let video;
      if (videoType === 'debate') {
          video = await videomongoose.findById(videoId);
      } else if (videoType === 'podcast') {
          video = await podcastsmongoose.findById(videoId);
      } else {
          return res.status(400).json({ message: 'Invalid video type.' });
      }

      if (video) {
          // Update watch hours
          user.UserWatchHours = (user.UserWatchHours[0] || 0) + watchTime; // Update the total watch time
          await user.save();

          video.WatchHours = (video.WatchHours[0] || 0) + watchTime;
          await video.save();

          res.status(200).json({ message: 'Watch time updated successfully.' });
      } else {
          res.status(404).json({ message: 'Video not found.' });
      }
  } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Server error.' });
  }
});

router.get("/Booking-Done/:id",isloggedin, async function (req, res) {
  try{
    const Live = await liveMongo.findById(req.params.id).populate({
      path: "BookingDoneBy",
      select: "username"
    });
    const user = await User.findOne({ email: req.user.email })
  
    const userId = req.user._id;
      
    if (!Live.BookingDoneBy.includes(user._id)) {
      Live.BookingDoneBy.push(user._id);
      Live.Booking += 1
      await Live.save();
      console.log("Booking not done");
    }else{
      console.log("Booking Done")
    }
    if (!user.Booked.includes(Live._id)){
      user.Booked.push(Live._id)
      await user.save();
      console.log("Booked not recieved the Live Id");
    }else{
      console.log("Booked recieved the Live Id")
    }

    console.log("Payement Done", Live.BookingDoneBy);

   res.redirect(`/live-content-applying-page/${req.params.id}`);
  }catch(err){
     res.redirect("/")
  }
});

router.post("/Booking-Done-for-community/:id",isloggedin, async function (req, res) {
  try{
    const community = await communityMongo.findById(req.params.id);

      if(!community.members.includes(req.user._id)){
        community.members.push(req.user._id);
        await community.save();
      }else{
       res.send("Already a member");
      }

   res.redirect(`/community-chat/${req.params.id}`);
  }catch(err){
     res.redirect("/")
  }
});

router.get("/Livedebate/:id",isloggedin, async function (req, res) {
  const Live = await liveMongo.findById(req.params.id).populate({
    path: "creator",
    select: "followers username"
  });

  const user = await User.findOne({email: req.user.email});

  const followerscount = Live.creator[0].followers;
    const follower = followerscount.length;
    const isFollowing = followerscount.includes(req.user._id);

    const source = req.query.source || "link";

  res.render("live-player", { Live, user, isFollowing,follower, source });
});

router.get("/start-debate", isloggedin, async function (req, res) {
  try {
    const content = await User.findOne({ email: req.user.email }).populate({
      path: "Live",
      select: "title description Time opponent",
      populate: {
        path: "opponent",
        select: "username"
      }
    });

    // Filter and calculate hoursLeft for active debates only
    const updatedContent = content.Live.filter((liveContent) => {
      const Time = new Date(liveContent.Time).getTime();
      const TimeLeft = Time - Date.now();
      return TimeLeft > 0; // Include only future debates
    }).map((liveContent) => {
      const Time = new Date(liveContent.Time).getTime();
      const TimeLeft = Time - Date.now();
      const hours = TimeLeft / (1000 * 60 * 60);
      const hoursLeft = hours.toFixed(1);

      return {
        ...liveContent.toObject(), // Convert Mongoose document to plain object
        hoursLeft,
        opponent: liveContent.opponent[0].username    //problem here should be solved only 0th index name getting
      };
    });
    

    res.render("start-debate", { content: updatedContent });
  } catch (err) {
    res.send(err);
    console.log(err);
  }
});

router.get("/MUN-competetion",isloggedin, async function(req, res){
  const competition = await competitionMongo.find({});
     res.render("MUN-PAGE", { competition });
});

router.get("/Discover-Page-of-MUN/:id",isloggedin, async function(req, res){
  const competition = await competitionMongo.findById(req.params.id); 
  
  res.render("MUN-competition-page", { competition });

});

router.get("/My-ticket",isloggedin,async function(req, res){
  const tickets = await User.findOne({ email: req.user.email }).populate({
    path: "Booked",
    select: "title Thumbnail Booking Time creator",
    populate: [
    {
      path: "creator",
      select: "username"
    },
    {
      path: "opponent",
      select: "username"
    }
  ]
  });

  res.render("tickets", { tickets });
});

module.exports = router;