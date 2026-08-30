from reportlab.lib.pagesizes import A4
from reportlab.lib.colors import HexColor
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image, Table, TableStyle
import os
out = os.path.join(os.path.dirname(__file__), 'public', 'downloads', 'mozart-tutor-agreement.pdf')
os.makedirs(os.path.dirname(out), exist_ok=True)
styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name='BrandTitle', parent=styles['Title'], fontSize=22, leading=26, textColor=HexColor('#A3121A'), spaceAfter=6))
styles.add(ParagraphStyle(name='BodyBrand', parent=styles['BodyText'], fontSize=10.5, leading=15, textColor=HexColor('#302B29'), spaceAfter=10))
styles.add(ParagraphStyle(name='SectionBrand', parent=styles['Heading2'], fontSize=13, leading=16, textColor=HexColor('#211B19'), spaceBefore=8, spaceAfter=6))
doc = SimpleDocTemplate(out, pagesize=A4, rightMargin=20*mm, leftMargin=20*mm, topMargin=18*mm, bottomMargin=18*mm)
logo = os.path.join(os.path.dirname(__file__), 'public', 'mozartLogo.jpg')
header = [[Image(logo, width=18*mm, height=18*mm), Paragraph('<b>Mozart Techniques</b><br/><font size="9">Tutor Agreement</font>', styles['BodyBrand'])]]
table = Table(header, colWidths=[22*mm, 145*mm]); table.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'MIDDLE'), ('LINEBELOW',(0,0),(-1,-1),1,HexColor('#CC0000')), ('BOTTOMPADDING',(0,0),(-1,-1),8)]))
story = [table, Spacer(1, 12), Paragraph('Mozart Techniques Tutor Agreement', styles['BrandTitle']), Paragraph('Please retain this copy for your records. By accepting this agreement in the Mozart Techniques application form, the tutor confirms the terms below.', styles['BodyBrand'])]
for title, body in [('Professional conduct','Tutors provide safe, respectful and professional lessons, protect student information, and communicate through the platform for matched students.'),('Free introductory class','The first completed class between a tutor and each new student is free. No lesson fee, platform fee or travel fee is charged for that introductory class.'),('Fees and earnings','Beginning with the second completed class for that tutor-student pairing, Mozart Techniques deducts a 10% platform service fee from lesson earnings. This 10% rate applies equally to every tutor, including country administrators who teach.'),('Billing and payouts','A tutor starts the lesson clock only after the lesson begins. A bill is released only after confirmation by the responsible payer. Tutor withdrawal requests are reviewed and settled to the bank details supplied by the tutor.'),('Sponsored students','Where a student is enrolled under an active organization subscription code, the organization is responsible for eligible lesson bills. The sponsored student is not charged personally.'),('Acceptance','The tutor confirms that their application, CV and qualifications are accurate and that they will follow Mozart Techniques policies.')]:
    story += [Paragraph(title, styles['SectionBrand']), Paragraph(body, styles['BodyBrand'])]
story += [Spacer(1, 12), Paragraph('Mozart Techniques | Tutor Agreement | Version 1.0', ParagraphStyle('Footer', parent=styles['BodyText'], fontSize=8, textColor=HexColor('#777777')))]
doc.build(story)
