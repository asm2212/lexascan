import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const app = express();

mongoose.connect(process.env.MONGODB_URI!)
.then(() => console.log("connected to mongodb"))
.catch((err) => console.error(err));

app.use(cors());
app.use(helmet());
app.use(morgan("dev"));
app.use(express.json());

const PORT = 5000
app.listen(PORT, () => {
    console.log(`server started on port ${PORT}`);
})

