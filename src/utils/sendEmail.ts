import nodemailer from "nodemailer";

export async function sendEmail(to: string, html: string) {
    // let testAccount = await nodemailer.createTestAccount();

    let transporter = nodemailer.createTransport({
        host: "smtp.ethereal.email",
        port: 587,
        secure: false, // true for 465, false for other ports
        auth: {
            user: "wm3dhd7x2hcpzbiq@ethereal.email", // generated ethereal user
            pass: "7NSPfA4yFKsDZDQnFB", // generated ethereal password
        },
    });

    let info = await transporter.sendMail({
        from: '"Fred Foo 👻" <foo@example.com>', // sender address
        to: to,
        subject: "Change password",
        html,
    });

    console.log("Message sent: %s", info.messageId);

    console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));
}
