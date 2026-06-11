"use client";

import { Document, Page, Text, View, StyleSheet, Image, Font } from "@react-pdf/renderer";

// Define styles for the PDF
const styles = StyleSheet.create({
  page: {
    padding: 30,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#333",
  },
  header: {
    flexDirection: "row",
    borderBottomWidth: 2,
    borderBottomColor: "#10b981",
    paddingBottom: 15,
    marginBottom: 15,
  },
  logo: {
    width: 60,
    height: 60,
    marginRight: 15,
  },
  headerTextContainer: {
    justifyContent: "center",
  },
  hospitalName: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#064e3b",
    marginBottom: 4,
  },
  hospitalAddress: {
    fontSize: 10,
    color: "#4b5563",
    marginBottom: 2,
  },
  hospitalContact: {
    fontSize: 9,
    color: "#6b7280",
  },
  patientInfoBlock: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    paddingBottom: 15,
  },
  infoCol: {
    width: "50%",
    marginBottom: 4,
  },
  infoText: {
    fontSize: 9,
  },
  infoLabel: {
    fontWeight: "bold",
  },
  mainContent: {
    flexDirection: "row",
    flex: 1,
  },
  leftColumn: {
    width: "35%",
    paddingRight: 15,
    borderRightWidth: 1,
    borderRightColor: "#e5e7eb",
  },
  rightColumn: {
    width: "65%",
    paddingLeft: 15,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: "bold",
    marginBottom: 6,
    marginTop: 10,
    color: "#1f2937",
  },
  sectionContent: {
    fontSize: 9,
    color: "#4b5563",
    lineHeight: 1.4,
  },
  rxSymbol: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 10,
  },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 30,
    right: 30,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    paddingTop: 10,
  },
  doctorSignatureBlock: {
    marginTop: 40,
  },
  doctorName: {
    fontWeight: "bold",
    fontSize: 10,
  },
  doctorSpecialty: {
    fontSize: 9,
    color: "#4b5563",
  },
  bmdcLabel: {
    fontSize: 9,
    color: "#4b5563",
    marginTop: 2,
  },
});

interface PrescriptionData {
  pastIllness: string;
  disease: string;
  investigation: string;
  referredOpd: string;
  medicines: string;
  patient: any;
  doctor: any;
  date: string;
  time: string;
}

export function PrescriptionPDF({ data }: { data: PrescriptionData }) {
  // We use window.location.origin for absolute image URLs in browser
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const logoUrl = `${baseUrl}/logo-transparent.png`;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          {logoUrl && <Image src={logoUrl} style={styles.logo} />}
          <View style={styles.headerTextContainer}>
            <Text style={styles.hospitalName}>SHEBOK AI HEALTHCARE</Text>
            <Text style={styles.hospitalAddress}>Dhaka, Bangladesh</Text>
            <Text style={styles.hospitalContact}>TEL: +880-123456789 | Email: contact@shebok.ai</Text>
          </View>
        </View>

        {/* Patient Info */}
        <View style={styles.patientInfoBlock}>
          <View style={styles.infoCol}>
            <Text style={styles.infoText}><Text style={styles.infoLabel}>Patient ID: </Text> {data.patient?.nid_hash || "N/A"}</Text>
          </View>
          <View style={styles.infoCol}>
            <Text style={styles.infoText}><Text style={styles.infoLabel}>Visit Date & Time: </Text> {data.date} {data.time}</Text>
          </View>
          <View style={styles.infoCol}>
            <Text style={styles.infoText}><Text style={styles.infoLabel}>Name: </Text> {data.patient?.name || "Unknown"}</Text>
          </View>
          <View style={styles.infoCol}>
            <Text style={styles.infoText}><Text style={styles.infoLabel}>Gender: </Text> {data.patient?.gender || "Not specified"}</Text>
          </View>
          <View style={styles.infoCol}>
            <Text style={styles.infoText}><Text style={styles.infoLabel}>Age: </Text> {data.patient?.age ? `${data.patient.age}Y` : (data.patient?.dob ? `${new Date().getFullYear() - new Date(data.patient.dob).getFullYear()}Y` : "N/A")}</Text>
          </View>
          <View style={styles.infoCol}>
            <Text style={styles.infoText}><Text style={styles.infoLabel}>Department: </Text> {data.doctor?.specialty || "General"}</Text>
          </View>
        </View>

        {/* Main Content Columns */}
        <View style={styles.mainContent}>
          {/* Left Column (History & Investigations) */}
          <View style={styles.leftColumn}>
            {data.pastIllness && (
              <View>
                <Text style={styles.sectionTitle}>Past Illness</Text>
                <Text style={styles.sectionContent}>{data.pastIllness}</Text>
              </View>
            )}

            {data.disease && (
              <View>
                <Text style={styles.sectionTitle}>Disease</Text>
                <Text style={styles.sectionContent}>{data.disease}</Text>
              </View>
            )}

            {data.investigation && (
              <View>
                <Text style={styles.sectionTitle}>Investigation</Text>
                <Text style={styles.sectionContent}>{data.investigation}</Text>
              </View>
            )}

            {data.referredOpd && (
              <View>
                <Text style={styles.sectionTitle}>Referred OPD</Text>
                <Text style={styles.sectionContent}>{data.referredOpd}</Text>
              </View>
            )}
          </View>

          {/* Right Column (Rx) */}
          <View style={styles.rightColumn}>
            <Text style={styles.rxSymbol}>Rx</Text>
            {data.medicines ? (
              <Text style={styles.sectionContent}>{data.medicines}</Text>
            ) : (
              <Text style={styles.sectionContent}>No medicines prescribed.</Text>
            )}

            {/* Doctor Signature Block */}
            <View style={styles.doctorSignatureBlock}>
              <Text style={styles.doctorName}>{data.doctor?.name?.toUpperCase()}</Text>
              <Text style={styles.doctorSpecialty}>{data.doctor?.specialty}</Text>
              {data.doctor?.bmdc_reg && (
                <Text style={styles.bmdcLabel}>BMDC Reg No: {data.doctor.bmdc_reg}</Text>
              )}
            </View>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={{ fontSize: 8, color: "#9ca3af" }}>Generated on {data.date} {data.time}</Text>
          <Text style={{ fontSize: 8, color: "#9ca3af" }}>Powered by Shebok AI</Text>
        </View>
      </Page>
    </Document>
  );
}
