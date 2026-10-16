
const { MongoClient } = require('mongodb');

const url = "mongodb://ananyaacharya686_db_user:Ananya2006@ac-t582r7p-shard-00-00.lvbb2mn.mongodb.net:27017,ac-t582r7p-shard-00-01.lvbb2mn.mongodb.net:27017,ac-t582r7p-shard-00-02.lvbb2mn.mongodb.net:27017/?ssl=true&replicaSet=atlas-mb05j3-shard-0&authSource=admin";

async function main() {
    const client = new MongoClient(url);

    try {
        // CONNECT TO MONGODB
        await client.connect();
        console.log("Connected to MongoDB");

        const db = client.db("college");
        console.log("Connected to the college database");

        const students = db.collection("students");

        // CREATE: Insert one student
        const insertResult = await students.insertOne({
            fullName: "Ananya Acharya",
            usn: "ai001",
            branch: "AIML",
            cgpa: 8.36
        });

        console.log("Single student inserted:", insertResult.insertedId);

        // INSERT MANY: Insert multiple students
        const manyResult = await students.insertMany([
            {
                fullName: "Rahul Kumar",
                usn: "ai002",
                branch: "CSE",
                cgpa: 8.75
            },
            {
                fullName: "Priya Shetty",
                usn: "ai003",
                branch: "ISE",
                cgpa: 9.1
            },
            {
                fullName: "Rohan Rao",
                usn: "ai004",
                branch: "AIML",
                cgpa: 8.9
            }
        ]);

        console.log("Multiple students inserted:", manyResult.insertedCount);

        // READ: Display all students
        const rows = await students.find().toArray();
        console.log("All Students:", rows);

        // UPDATE: Change Ananya's CGPA
        const updateResult = await students.updateOne(
            { usn: "ai001" },
            { $set: { cgpa: 9.0 } }
        );

        console.log("Students matched:", updateResult.matchedCount);
        console.log("Students updated:", updateResult.modifiedCount);

        // READ ONE: Display the updated student
        const updatedStudent = await students.findOne({ usn: "ai001" });
        console.log("Updated Student:", updatedStudent);

        // DELETE: Delete one student by USN
        const deleteResult = await students.deleteOne({ usn: "ai004" });

        console.log("Students deleted:", deleteResult.deletedCount);

        // READ AGAIN: Display remaining students
        const remainingStudents = await students.find().toArray();
        console.log("Remaining Students:", remainingStudents);

    } catch (error) {
        console.error("MongoDB error:", error.message);
    } finally {
        await client.close();
        console.log("MongoDB connection closed");
    }
}

main();
