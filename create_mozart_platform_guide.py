from reportlab.lib import colors
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Image, Table, TableStyle,
    PageBreak, KeepTogether
)
import os

ROOT = os.path.dirname(__file__)
OUT = os.path.join(ROOT, 'public', 'downloads', 'mozart-techniques-platform-guide.pdf')
LOGO = os.path.join(ROOT, 'public', 'mozartLogo.jpg')

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name='GuideTitle', parent=styles['Title'], fontName='Helvetica-Bold', fontSize=23, leading=28, textColor=HexColor('#A3121A'), spaceAfter=9))
styles.add(ParagraphStyle(name='GuideSubtitle', parent=styles['BodyText'], fontSize=10.5, leading=15, textColor=HexColor('#4B5563'), spaceAfter=12))
styles.add(ParagraphStyle(name='GuideHeading', parent=styles['Heading2'], fontName='Helvetica-Bold', fontSize=14, leading=18, textColor=HexColor('#211B19'), spaceBefore=12, spaceAfter=6))
styles.add(ParagraphStyle(name='GuideBody', parent=styles['BodyText'], fontSize=9.5, leading=14, textColor=HexColor('#302B29'), spaceAfter=6))
styles.add(ParagraphStyle(name='GuideSmall', parent=styles['BodyText'], fontSize=8.4, leading=11, textColor=HexColor('#4B5563'), spaceAfter=3))
styles.add(ParagraphStyle(name='GuideCallout', parent=styles['BodyText'], fontSize=9.5, leading=14, textColor=HexColor('#5B2020'), backColor=HexColor('#FFF5F5'), borderColor=HexColor('#E5B3B3'), borderWidth=.6, borderPadding=9, spaceBefore=5, spaceAfter=9))

def bullets(items):
    return [Paragraph('&bull; ' + item, styles['GuideBody']) for item in items]

def header_footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(HexColor('#D8B1B1'))
    canvas.line(20 * mm, 15 * mm, 190 * mm, 15 * mm)
    canvas.setFillColor(HexColor('#777777'))
    canvas.setFont('Helvetica', 8)
    canvas.drawString(20 * mm, 10 * mm, 'Mozart Techniques | Platform guide')
    canvas.drawRightString(190 * mm, 10 * mm, 'Page %d' % doc.page)
    canvas.restoreState()

os.makedirs(os.path.dirname(OUT), exist_ok=True)
doc = SimpleDocTemplate(OUT, pagesize=A4, leftMargin=20*mm, rightMargin=20*mm, topMargin=18*mm, bottomMargin=22*mm)

logo_cell = Image(LOGO, width=16*mm, height=16*mm) if os.path.exists(LOGO) else Paragraph('<b>M</b>', styles['GuideTitle'])
head = Table([[logo_cell, Paragraph('<b>Mozart Techniques</b><br/><font size="9">Learning, teaching and sponsorship platform</font>', styles['GuideBody'])]], colWidths=[22*mm, 148*mm])
head.setStyle(TableStyle([
    ('VALIGN', (0,0), (-1,-1), 'MIDDLE'), ('LINEBELOW', (0,0), (-1,-1), 1, HexColor('#A3121A')), ('BOTTOMPADDING', (0,0), (-1,-1), 8)
]))

story = [head, Spacer(1, 12), Paragraph('Mozart Techniques: Platform Guide', styles['GuideTitle']), Paragraph('Prepared for Gideon Solomon', styles['GuideSubtitle']), Paragraph('This guide describes the current Mozart Techniques workflow, the feature set, and the recommended billing and monitoring model for online, tutor-travel and studio lessons.', styles['GuideBody'])]

story += [Paragraph('1. The learning modes and billing model', styles['GuideHeading'])]
billing_rows = [
    [Paragraph('<b>Mode</b>', styles['GuideSmall']), Paragraph('<b>What the student pays</b>', styles['GuideSmall']), Paragraph('<b>Recommended billing point</b>', styles['GuideSmall'])],
    [Paragraph('<b>Online</b>', styles['GuideSmall']), Paragraph('Tutor lesson fee only.', styles['GuideSmall']), Paragraph('Tutor starts the lesson clock after the class begins. Bill is created when it ends.', styles['GuideSmall'])],
    [Paragraph('<b>Tutor travels to student</b>', styles['GuideSmall']), Paragraph('Tutor lesson fee + a clearly shown transportation fee. Keep the transport fee separate from the 10% platform fee.', styles['GuideSmall']), Paragraph('Show the full estimate before a student requests the tutor. Bill the fixed travel fee only for a completed session.', styles['GuideSmall'])],
    [Paragraph('<b>Studio lesson</b>', styles['GuideSmall']), Paragraph('Tutor lesson fee only. The student travels to the tutor, so transportation is zero.', styles['GuideSmall']), Paragraph('Show the studio address only after the tutor-student match is active; create the bill when the lesson ends.', styles['GuideSmall'])],
]
billing_table = Table(billing_rows, colWidths=[34*mm, 63*mm, 73*mm], repeatRows=1)
billing_table.setStyle(TableStyle([
    ('BACKGROUND',(0,0),(-1,0),HexColor('#A3121A')), ('TEXTCOLOR',(0,0),(-1,0),colors.white), ('VALIGN',(0,0),(-1,-1),'TOP'),
    ('GRID',(0,0),(-1,-1),.35,HexColor('#D1D5DB')), ('BACKGROUND',(0,1),(-1,-1),HexColor('#FFFDFC')), ('LEFTPADDING',(0,0),(-1,-1),6), ('RIGHTPADDING',(0,0),(-1,-1),6), ('TOPPADDING',(0,0),(-1,-1),6), ('BOTTOMPADDING',(0,0),(-1,-1),6)
]))
story += [billing_table, Spacer(1, 8), Paragraph('<b>First lesson policy:</b> the first completed class for each tutor-student pair is free. From the second completed class onwards, the tutor fee is billable and Mozart Techniques deducts 10% from the tutor earnings. An organization-sponsored student is not charged personally; the organization receives the lesson bill.', styles['GuideCallout'])]

story += [Paragraph('2. Monitoring teaching and protecting everyone', styles['GuideHeading'])]
story += bullets([
    '<b>Lesson clock:</b> only the tutor can start it, and only after the lesson begins. Record start time, end time, duration, learning subject and mode.',
    '<b>Meeting evidence:</b> use Google Calendar/Meet for online sessions. Store the calendar event and meeting link on the assignment and show it in the shared schedule.',
    '<b>Completion attestation:</b> the student confirms a normal lesson before funds are released. For sponsored learners, the organization pays the held bill.',
    '<b>Quality check:</b> request a rating after each class; the tutor rating is the average of all submitted lesson ratings, so it changes as new reviews are received.',
    '<b>Dispute controls:</b> keep the bill held if a learner reports a problem. Give administrators a review screen containing session time, teacher notes, scheduled event and chat history before any release.',
    '<b>Safety:</b> retain in-platform chat, schedule records, tutor verification and student profile details. Do not expose a tutor studio address before an active match.'
])

story += [Paragraph('3. Current platform features', styles['GuideHeading'])]
features = [
    '<b>Accounts and profiles:</b> sign-up, secure login, country/profile details, student photo, tutor photo, qualifications and CV uploads.',
    '<b>Tutor onboarding:</b> required tutor application fields, CV/certificate upload, subject/level/genre setup, a scroll-to-accept agreement and administrator approval.',
    '<b>Find a tutor:</b> tutor discovery by learning subject and relevant profile details, tutor request flow, request status, and tutor/admin acceptance.',
    '<b>Tutor and student dashboards:</b> active requests, current lessons, wallet balance, profile editing, notifications, messages and shared scheduling.',
    '<b>Scheduling:</b> Google Calendar/Meet connection, meeting scheduling, upcoming/current/past session views, lesson links and chat notifications.',
    '<b>Technique video library:</b> tutor/admin uploads or links, descriptions, subject tags, embedded playback, edit/delete controls and course-specific discovery.',
    '<b>Payments:</b> free first class, held lesson bills, 10% tutor fee, tutor travel fee, student confirmation, sponsored organization billing and payment records.',
    '<b>Organizations:</b> NGO/sponsor application, subscription payment, access-code generation, sponsored student enrollment, organization tutor messaging and organization-paid bills.',
    '<b>Administration:</b> tutor and organization approval, country administrators, student/tutor requests, access codes, payout queue, lesson/complaint visibility and notifications.',
    '<b>Payout requests:</b> tutors save bank details, submit an amount up to their available balance, and administrators process the recorded request after making the external bank transfer.'
]
story += bullets(features)

story += [PageBreak(), Paragraph('4. How to use Mozart Techniques', styles['GuideHeading'])]
steps = [
    ('Student', 'Create an account, complete your profile and read the Student Agreement. Search for a suitable tutor, choose online, tutor-travel or studio learning, then submit a request.'),
    ('Tutor', 'Create an account, complete every application field, upload a CV/certificate and photo, read the Tutor Agreement, then submit for review. Once approved, keep your subjects, rate and availability accurate.'),
    ('Matching', 'A tutor or an administrator accepts the student request. The assignment becomes active, and both people can see the relevant dashboard, messages and schedule.'),
    ('Scheduling', 'For online learning, the tutor connects Google Calendar, schedules the session and shares the Meet link. For studio or tutor-travel learning, record the agreed time and selected mode in the assignment.'),
    ('Teaching', 'The tutor clicks Lesson started only when the session starts. At the end, the tutor completes the lesson record with duration, notes and learning material. The first lesson is marked free automatically.'),
    ('Billing', 'For normal paid classes, the app creates a held bill. The learner confirms it to release the tutor earning. For tutor travel, the visible transport amount is included; for studio, it is zero. For sponsored students, the organization pays the bill.'),
    ('Feedback', 'After class, the student submits a rating. The tutor average updates from all ratings over time.'),
    ('Withdrawal', 'A tutor saves bank payout details and submits a withdrawal request. An administrator verifies it, transfers money outside the app, then marks the request processed so the tutor balance is debited.'),
    ('Organization sponsor', 'An approved organization pays its subscription, generates/redeems access codes for students, and pays held lesson bills for sponsored students from the organization dashboard.'),
    ('Administrator', 'Review applications and requests, match or approve people in the correct country, supervise activity and disputes, pay approved tutor withdrawals externally, then mark each payout processed.')
]
for number, (role, description) in enumerate(steps, 1):
    story.append(KeepTogether([Paragraph(f'{number}. {role}', styles['GuideHeading']), Paragraph(description, styles['GuideBody'])]))

story += [Paragraph('5. Recommended next safeguards', styles['GuideHeading'])]
story += bullets([
    'Let administrators set transportation pricing by country, city or distance band instead of relying on one fixed global price.',
    'Show a transparent quote before a request: tutor fee, estimated duration, transportation fee (if any), total and first-class-free notice.',
    'Add a dispute state that freezes a bill and requires administrator review before payment is released.',
    'Use administrator-only payout reconciliation: bank transfer reference, date paid, reviewer and downloadable payout receipt.',
    'Enable automated payout only after integrating a regulated payout provider and verifying tutor identity and bank accounts.'
])
story += [Spacer(1, 10), Paragraph('Mozart Techniques | Platform guide | Version 1.0', styles['GuideSmall'])]

doc.build(story, onFirstPage=header_footer, onLaterPages=header_footer)
print(OUT)
