const express = require('express')
const cors = require('cors');
const  jwt = require('jsonwebtoken')
const app = express();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config()
const stripe=require('stripe')(process.env.STRIPE_SECRET_KEY)
const port = process.env.PORT || 5000
//middleware
app.use(cors({
    origin: [
        "http://localhost:5173",
    ],
    credentials: true
}))
app.use(express.json())

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ejjba9r.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection
    const menucollection=client.db('BistroDB').collection('menu')
    const reviwcollection=client.db('BistroDB').collection('reviews')
    const cartcollection=client.db('BistroDB').collection('carts')
    const usercollection=client.db('BistroDB').collection('users')
    const paymentcollection=client.db('BistroDB').collection('payments')
    //middleware
    const verifytoken=(req,res,next)=>{
//console.log('inside verify token',req.headers.authorization)
if(!req.headers.authorization){
  return res.status(401).send({message:'unauthorized access'})
}
const token=req.headers.authorization.split(' ')[1];
jwt.verify(token,process.env.SECRET_TOKEN,(err,decoded)=>{
  if(err){
    return res.status(401).send({message:'unauthorized access'})
  }
  req.decoded=decoded;
  next();
})
    }
    const verifyadmin=async(req,res,next)=>{
      const email=req.decoded.email;
      const query={email:email}
      const user=await usercollection.findOne(query);
      const isAdmin=user?.role==='Admin';
      if(!isAdmin){
        return res.status(403).send({message:"forbidden access"})
      }
      next();
    }
    app.get('/menu',async(req,res)=>{
      const result=await menucollection.find().toArray();
      res.send(result)
    })
    app.delete('/menu/:id',async(req,res)=>{
      const id=req.params.id
      const query={_id:new ObjectId(id)}
      const result=await menucollection.deleteOne(query);
      res.send(result)
    })
    app.get('/menu/:id',async(req,res)=>{
      const id=req.params.id
      const query={_id:new ObjectId(id)}
      const result=await menucollection.findOne(query);
      res.send(result)
    })
    app.patch('/menu/:id',async(req,res)=>{
      const id=req.params.id
      const item=req.body;
      const query={_id:new ObjectId(id)}
      const updateDoc = {
      $set: {
      name:item.name,
      category:item.category,
      price:item.price,
      image:item.image,
      recipe:item.recipe
      },
    };
      const result=await menucollection.updateOne(query, updateDoc);
      res.send(result)
    })
    app.post('/menu',verifytoken,verifyadmin,async(req,res)=>{
      const item=req.body;
      const result=await menucollection.insertOne(item)
      res.send(result)
    })
    app.get('/review',async(req,res)=>{
      const result=await reviwcollection.find().toArray();
      res.send(result)
    })
    app.get('/carts',async(req,res)=>{
      const email=req.query.email;
      const query={email : email}
      const result=await cartcollection.find(query).toArray();
      res.send(result)
    })
    app.delete('/carts/:id',async(req,res)=>{
      const id=req.params.id;
      const query={_id : new ObjectId(id)}
      const result=await cartcollection.deleteOne(query);
      res.send(result)
    })
    app.post('/carts',async(req,res)=>{
      const cart=req.body;
      const result=await cartcollection.insertOne(cart);
      res.send(result)
    })
    // user related api
    app.post('/users',async(req,res)=>{
      const user=req.body;
      const query={email:user.email}
      const existinguser=await usercollection.findOne(query)
      if(existinguser){
        return res.send({message:"User already exist",insertedId:null})
      }
      const result=await usercollection.insertOne(user)
      res.send(result)
    })
    
     app.get('/users',verifytoken,verifyadmin,async(req,res)=>{
      const result=await usercollection.find().toArray();
      res.send(result)
    })
    app.get('/users/admin/:email',verifytoken,async(req,res)=>{
      const email=req.params.email;
      if(email !==req.decoded.email){
        return res.status(403).send({message:"forbidden access"})
      }
      const query={email:email};
      const user=await usercollection.findOne(query)
      let admin=false;
      if(user){
        admin=user?.role==='Admin'
      }
      res.send({admin})
    })
     app.delete('/users/:id',verifytoken,verifyadmin,async(req,res)=>{
      const id=req.params.id;
      const query={_id : new ObjectId(id)}
      const result=await usercollection.deleteOne(query);
      res.send(result)
    })
    app.patch('/users/admin/:id',verifytoken,verifyadmin,async(req,res)=>{
      const id=req.params.id;
      const query={_id:new ObjectId(id)}
      const updatedoc={
        $set:{
             role:"Admin"
        }
      }
      const result = await usercollection.updateOne(query, updatedoc);
      res.send(result)
    })
    //jwt related api
    app.post('/jwt',async(req,res)=>{
      const user=req.body;
      const token=jwt.sign(user,process.env.SECRET_TOKEN,{
        expiresIn:"2h"
      });
      res.send({token})
    })
    //payment intent
    app.post('/create-payment-intent',async(req,res)=>{
      const {price}=req.body;
      const amount=parseInt(price*100)
      const paymentIntent = await stripe.paymentIntents.create({
  amount: amount,
  currency: 'usd',
  payment_method_types:['card'],
});
res.send({
  clientSecret:paymentIntent.client_secret
})
    })

    app.post('/payments',async(req,res)=>{
      const payment=req.body;
      const paymentresult=await paymentcollection.insertOne(payment)
      const query={_id:{
        $in:payment.cartIds.map(id=>new ObjectId(id))
      }}
      const deleteresult=await cartcollection.deleteMany(query);
      res.send({paymentresult,deleteresult})
    })
    app.get('/payments',verifytoken,async(req,res)=>{
      const email=req.query.email;
      if(email!==req.decoded.email){
        return res.status(403).send({message:"forbidden access"})
      }
      const filter={email:email}
      const result=await paymentcollection.find(filter).toArray();
      res.send(result)
    })
    app.get('/admin-stats',verifytoken,verifyadmin,async(req,res)=>{
      const users=await usercollection.estimatedDocumentCount()
      const orders=await cartcollection.estimatedDocumentCount()
      const menuitems=await menucollection.estimatedDocumentCount()
      const result=await paymentcollection.aggregate([
        {
        $group:{
          _id:null,
          totalrevenue:{$sum:'$price'}
        }
      }]).toArray();
      const totalrevenue=result.length>0?result[0].totalrevenue :0;
      res.send({
        users,orders,menuitems,totalrevenue
      })
    })
    app.get('/order-stats',verifytoken,verifyadmin,async(req,res)=>{
      const result=await paymentcollection.aggregate([
          {
            $unwind:'$menuitemids'
          },
          {
      $addFields: {
        menuitemids: { $toObjectId: "$menuitemids" }
      }
    },
          {
            $lookup:{
              from:'menu',
              localField:'menuitemids',
              foreignField:'_id',
              as:'menuitems'
            }
          },
          {
            $unwind:'$menuitems'
          },
          {
            $group:{
              _id:'$menuitems.category',
              quantity:{$sum:1},
              revenue:{$sum:'$menuitems.price'}
            }
          },
          {
            $project:{
              _id:0,
              category:'$_id',
              quantity:'$quantity',
              revenue:'$revenue'
            }
          }
      ]).toArray();
      res.send(result)
    })
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
   // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('Hello World! this is siam')
})
app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
