import { matchedData, validationResult } from 'express-validator';
import User from '../models/user.schema.mjs';
import hashPassword from '../helpers/crypt.mjs';
import { redisClient } from '../constants/redisClient.mjs';
import { sendEmail } from '../helpers/sendMail.mjs';

/**
 * @description 
 * The get profile to handle the `GET` request when the user want to see his profile
 * 
 * It finds the user by their id and then sends a json body with their username, email and their uploaded files
 * 
 * 
 * 
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 */
const getProfile = async (req, res) => {
    try {
        const user = await User.findById({ _id: req.user.id });
        const response = {
            success: true, data: {
                username: user.username, email: user.email, filesUploaded: user.files
            }
        };
        await redisClient.setEx(`${req.user.id}:${req.method}:${req.baseUrl}`, 60 * 15, JSON.stringify(response))
        res.status(200).json(response);
    } catch (error) {
        console.log(error);
        res.status(500).json({ success: false, error: "Couldn't get profile" })
    }
}
/**
 * @description 
 * The function responsible for the `PUT` request to update the user profile
 * 
 * it uses `validationResult` from `express-validator` to validate that the user inputed a right value for the info
 * then checks for the data he sent and updates it in the Database
 * 
 * 
 * 
 * @param {import('express').Request} req 
 * @param {import('express').Response} res 
 */
const updateProfile = async (req, res) => {
    // Get the validation result to check and see if the user did something wrong
    const result = validationResult(req);
    // Check for errors
    if (!result.isEmpty()) return res.status(400).json({ success: false, errors: result.array() })
    // Check if the query is empty or not
    if (!req.query.username && !req.query.password && !req.query.email) return res.status(400).json({ success: false, error: "Nothing was provided in the request query" })
    // Get the data
    const data = matchedData(req);
    try {
        // Check for a username
        if (data.username) {
            await User.updateOne({ _id: req.user.id }, { $set: { username: data.username } })
            req.user.username = data.username;
        }
        // Check for a password
        if (data.password) {
            data.password = hashPassword(data.password);
            await User.updateOne({ _id: req.user.id }, { $set: { password: data.password } })
            req.user.password = data.password;
        }
        // Check for an email
        if (data.email) {
            const user = await User.findById(req.user.id);
            user.email = data.email;
            user.verified = false;
            user.token = crypto.randomUUID().toString('hex');
            await user.save();
            await sendEmail(data.email, process.env.MAIL_PASS, `Click this link to verify your account: https://${req.hostname}${req.baseUrl}/email-verification?token=${user.token}`,
                "Verify Account")
            req.user.email = data.email;
            req.logout(err => {
                if (err) {
                    // Return server error response if logout fails
                    return res.sendStatus(500);
                }
                // Destroy session and return success response if logout is successful
                req.session.destroy(err => { if (err) console.log(err.message); })
            })
        }
        res.status(200).json({ success: true, message: "Profile updated successfully" })
    } catch (error) {
        res.status(500).json({ success: false, error: "Updating profile failed" })
    }
}

export { getProfile, updateProfile }