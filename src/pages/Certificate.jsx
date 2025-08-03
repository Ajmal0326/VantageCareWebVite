import React, { useState } from "react";
import { getFirestore, collection, addDoc } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const Certificate = () => {
  const [certificates, setCertificates] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [expiryInputVisible, setExpiryInputVisible] = useState(false);
  const [expiryDate, setExpiryDate] = useState("");

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const fileType = file.type;
    const validTypes = ["application/pdf", "image/jpeg", "image/png"];
    const maxSize = 5 * 1024 * 1024; // 5MB

    if (!validTypes.includes(fileType)) {
      alert("Invalid file type. Only PDF, JPEG, PNG are allowed.");
      return;
    }

    if (file.size > maxSize) {
      alert("File too large. Max size is 5MB.");
      return;
    }

    setSelectedFile(file);
    setExpiryInputVisible(true);
  };

  const db = getFirestore();
  const auth = getAuth();

  const uploadCertificateToFirestore = async (certificate) => {
    try {
      const user = auth.currentUser;
      if (!user) {
        throw new Error("User not authenticated");
      }

      console.log("user id :", user.uid);

      const docRef = await addDoc(
        collection(db, "Certificates", user.uid, "Mycertificates"),
        certificate
      );

      console.log("Certificate uploaded with ID: ", docRef.id);
    } catch (error) {
      console.error("Error uploading certificate: ", error.message);
    }
  };

  const handleExpirySubmit = () => {
    if (!expiryDate) {
      alert("Please enter expiry date.");
      return;
    }

    const today = new Date();
    const selectedExpiry = new Date(expiryDate);

    // 🛑 Expiry date must be today or in future
    if (selectedExpiry < today.setHours(0, 0, 0, 0)) {
      alert("Expiry date cannot be earlier than today.");
      return;
    }

    const newCert = {
      name: selectedFile.name,
      uploadDate: new Date().toLocaleDateString("en-GB"),
      expiryDate: selectedExpiry.toLocaleDateString("en-GB"),
      status: "Pending",
    };

    setCertificates((prev) => [...prev, newCert]);
    // uploadCertificateToFirestore(newCert);
    setSelectedFile(null);
    setExpiryDate("");
    setExpiryInputVisible(false);
  };

  const handleUploadClick = () => {
    document.getElementById("fileInput").click();
  };

  return (
    <div className="p-4 sm:p-8 max-w-5xl mx-auto">
      <h2 className="text-xl sm:text-2xl font-semibold mb-1">
        Upload your certifications
      </h2>
      <p className="text-sm mb-6 text-gray-700">
        Accepted format: <strong>PDF, JPEG, PNG</strong>, Max size:{" "}
        <strong>5MB</strong>
      </p>

      {/* Upload Box */}
      <div
        className="bg-blue-700 text-white p-6 rounded-md text-center mb-6 cursor-pointer"
        onClick={handleUploadClick}
      >
        <div className="text-4xl mb-2">☁️</div>
        <p className="mb-2 text-base">Drop files here or click to upload</p>
        <button className="bg-blue-900 px-4 py-2 rounded hover:bg-blue-800 transition">
          Upload Certificate
        </button>
        <input
          type="file"
          id="fileInput"
          accept=".pdf, .jpeg, .jpg, .png"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* Expiry Date Input */}
      {expiryInputVisible && (
        <div className="mb-6 bg-blue-100 p-4 rounded shadow">
          <p className="mb-2 font-medium text-gray-800">
            Enter Expiry Date for:{" "}
            <span className="font-semibold">{selectedFile?.name}</span>
          </p>
          <input
            type="date"
            className="p-2 border rounded mr-2"
            value={expiryDate}
            onChange={(e) => setExpiryDate(e.target.value)}
            min={new Date().toISOString().split("T")[0]} // prevents selecting past date
          />
          <button
            className="bg-blue-700 text-white px-4 py-2 rounded hover:bg-blue-800"
            onClick={handleExpirySubmit}
          >
            Submit
          </button>
        </div>
      )}

      <div className="bg-blue-800 text-white text-center p-2 rounded mb-4 text-sm">
        Ensure certifications are up to date before your next shift.
      </div>

      {/* Certificate Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full bg-blue-700 text-white rounded overflow-hidden text-sm">
          <thead>
            <tr className="text-left">
              <th className="px-4 py-3">Certificate Name</th>
              <th className="px-4 py-3">Upload Date</th>
              <th className="px-4 py-3">Expiry Date</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {certificates.length === 0 ? (
              <tr>
                <td className="px-4 py-4 text-center" colSpan="4">
                  No certificates uploaded.
                </td>
              </tr>
            ) : (
              certificates.map((cert, idx) => (
                <tr key={idx} className="border-t border-blue-600">
                  <td className="px-4 py-2">{cert.name}</td>
                  <td className="px-4 py-2">{cert.uploadDate}</td>
                  <td className="px-4 py-2">{cert.expiryDate}</td>
                  <td className="px-4 py-2">{cert.status}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Certificate;
