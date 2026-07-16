import logging
from dataclasses import dataclass, field
from datetime import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any, Optional

import aiosmtplib

from app.core.config import settings

logger = logging.getLogger(__name__)


@dataclass
class EmailMessage:
    to: str
    subject: str
    body_html: str
    body_text: str = ""
    cc: list[str] = field(default_factory=list)
    bcc: list[str] = field(default_factory=list)
    reply_to: str = ""


@dataclass
class WhatsAppMessage:
    to: str
    template_name: str
    parameters: list[str] = field(default_factory=list)
    language_code: str = "en"


@dataclass
class InAppNotification:
    user_id: int
    title: str
    message: str
    notification_type: str = "info"
    module: str = ""
    reference_type: str = ""
    reference_id: Optional[int] = None
    channel: str = "in_app"


async def send_email_notification(message: EmailMessage) -> bool:
    if not settings.SMTP_HOST or not settings.SMTP_USER:
        logger.warning("SMTP not configured. Skipping email to %s", message.to)
        return False

    try:
        msg = MIMEMultipart("alternative")
        msg["From"] = settings.SMTP_FROM
        msg["To"] = message.to
        msg["Subject"] = message.subject

        if message.cc:
            msg["Cc"] = ", ".join(message.cc)
        if message.reply_to:
            msg["Reply-To"] = message.reply_to

        if message.body_text:
            msg.attach(MIMEText(message.body_text, "plain"))
        msg.attach(MIMEText(message.body_html, "html"))

        all_recipients = [message.to] + message.cc + message.bcc

        await aiosmtplib.send(
            msg,
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            username=settings.SMTP_USER,
            password=settings.SMTP_PASSWORD,
            start_tls=True,
            recipients=all_recipients,
        )
        logger.info("Email sent to %s: %s", message.to, message.subject)
        return True
    except Exception as exc:
        logger.error("Failed to send email to %s: %s", message.to, exc)
        return False


async def send_whatsapp_notification(message: WhatsAppMessage) -> bool:
    if not settings.WHATSAPP_API_URL or not settings.WHATSAPP_API_KEY:
        logger.warning(
            "WhatsApp API not configured. Skipping message to %s", message.to
        )
        return False

    try:
        import httpx

        payload = {
            "messaging_product": "whatsapp",
            "to": message.to,
            "type": "template",
            "template": {
                "name": message.template_name,
                "language": {"code": message.language_code},
                "components": [
                    {
                        "type": "body",
                        "parameters": [
                            {"type": "text", "text": param}
                            for param in message.parameters
                        ],
                    }
                ],
            },
        }

        headers = {
            "Authorization": f"Bearer {settings.WHATSAPP_API_KEY}",
            "Content-Type": "application/json",
        }

        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                settings.WHATSAPP_API_URL,
                json=payload,
                headers=headers,
            )
            response.raise_for_status()

        logger.info(
            "WhatsApp message sent to %s: template=%s",
            message.to,
            message.template_name,
        )
        return True
    except Exception as exc:
        logger.error("Failed to send WhatsApp to %s: %s", message.to, exc)
        return False


async def create_in_app_notification(
    db: Any,
    notification: InAppNotification,
) -> Optional[int]:
    try:
        from app.models.models import Notification

        db_notification = Notification(
            user_id=notification.user_id,
            title=notification.title,
            message=notification.message,
            notification_type=notification.notification_type,
            module=notification.module,
            reference_type=notification.reference_type,
            reference_id=notification.reference_id,
            channel=notification.channel,
            is_read=False,
        )
        db.add(db_notification)
        await db.flush()
        await db.refresh(db_notification)
        notification_id = db_notification.id
        logger.info(
            "In-app notification created for user %d: %s",
            notification.user_id,
            notification.title,
        )
        return notification_id
    except Exception as exc:
        logger.error("Failed to create in-app notification: %s", exc)
        return None


class NotificationTemplates:
    @staticmethod
    def order_created(
        order_type: str,
        order_number: str,
        party_name: str,
        grand_total: float,
        order_date: str,
    ) -> dict[str, Any]:
        subject = f"New {order_type} #{order_number} from {party_name}"
        html = f"""
        <html>
        <body style="font-family: Arial, sans-serif; color: #333;">
            <h2 style="color: #1a1a2e;">New {order_type} Created</h2>
            <table style="border-collapse: collapse; width: 100%; max-width: 500px;">
                <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><b>{order_type.title()} Number</b></td><td style="padding: 8px; border-bottom: 1px solid #eee;">{order_number}</td></tr>
                <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><b>Party</b></td><td style="padding: 8px; border-bottom: 1px solid #eee;">{party_name}</td></tr>
                <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><b>Date</b></td><td style="padding: 8px; border-bottom: 1px solid #eee;">{order_date}</td></tr>
                <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><b>Grand Total</b></td><td style="padding: 8px; border-bottom: 1px solid #eee;">Rs. {grand_total:,.2f}</td></tr>
            </table>
            <p style="margin-top: 20px; color: #888; font-size: 12px;">This is an automated notification from Micro ERP.</p>
        </body>
        </html>
        """
        text = f"New {order_type} #{order_number} created for {party_name}. Total: Rs. {grand_total:,.2f}. Date: {order_date}"

        return {
            "email": EmailMessage(
                to="", subject=subject, body_html=html, body_text=text
            ),
            "whatsapp_params": [
                order_number,
                party_name,
                f"Rs. {grand_total:,.2f}",
                order_date,
            ],
            "in_app_title": f"New {order_type} #{order_number}",
            "in_app_message": f"{order_type.title()} created for {party_name}. Total: Rs. {grand_total:,.2f}",
            "in_app_type": "success",
        }

    @staticmethod
    def order_updated(
        order_type: str,
        order_number: str,
        party_name: str,
        old_status: str,
        new_status: str,
    ) -> dict[str, Any]:
        subject = f"{order_type} #{order_number} Status Updated"
        html = f"""
        <html>
        <body style="font-family: Arial, sans-serif; color: #333;">
            <h2 style="color: #1a1a2e;">{order_type.title()} Status Updated</h2>
            <table style="border-collapse: collapse; width: 100%; max-width: 500px;">
                <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><b>{order_type.title()} Number</b></td><td style="padding: 8px; border-bottom: 1px solid #eee;">{order_number}</td></tr>
                <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><b>Party</b></td><td style="padding: 8px; border-bottom: 1px solid #eee;">{party_name}</td></tr>
                <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><b>Previous Status</b></td><td style="padding: 8px; border-bottom: 1px solid #eee;">{old_status}</td></tr>
                <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><b>New Status</b></td><td style="padding: 8px; border-bottom: 1px solid #eee;"><b>{new_status}</b></td></tr>
            </table>
            <p style="margin-top: 20px; color: #888; font-size: 12px;">This is an automated notification from Micro ERP.</p>
        </body>
        </html>
        """
        text = f"{order_type.title()} #{order_number} for {party_name} status changed from {old_status} to {new_status}."

        return {
            "email": EmailMessage(
                to="", subject=subject, body_html=html, body_text=text
            ),
            "whatsapp_params": [order_number, party_name, new_status],
            "in_app_title": f"{order_type} #{order_number} Updated",
            "in_app_message": f"Status changed: {old_status} -> {new_status}",
            "in_app_type": "info",
        }

    @staticmethod
    def payment_received(
        invoice_number: str,
        party_name: str,
        amount: float,
        payment_date: str,
        balance: float = 0,
    ) -> dict[str, Any]:
        subject = f"Payment Received - Invoice #{invoice_number}"
        html = f"""
        <html>
        <body style="font-family: Arial, sans-serif; color: #333;">
            <h2 style="color: #28a745;">Payment Received</h2>
            <table style="border-collapse: collapse; width: 100%; max-width: 500px;">
                <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><b>Invoice Number</b></td><td style="padding: 8px; border-bottom: 1px solid #eee;">{invoice_number}</td></tr>
                <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><b>From</b></td><td style="padding: 8px; border-bottom: 1px solid #eee;">{party_name}</td></tr>
                <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><b>Amount</b></td><td style="padding: 8px; border-bottom: 1px solid #eee; color: #28a745; font-size: 18px;"><b>Rs. {amount:,.2f}</b></td></tr>
                <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><b>Date</b></td><td style="padding: 8px; border-bottom: 1px solid #eee;">{payment_date}</td></tr>
                <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><b>Outstanding Balance</b></td><td style="padding: 8px; border-bottom: 1px solid #eee;">Rs. {balance:,.2f}</td></tr>
            </table>
            <p style="margin-top: 20px; color: #888; font-size: 12px;">This is an automated notification from Micro ERP.</p>
        </body>
        </html>
        """
        text = f"Payment of Rs. {amount:,.2f} received from {party_name} for Invoice #{invoice_number} on {payment_date}. Balance: Rs. {balance:,.2f}"

        return {
            "email": EmailMessage(
                to="", subject=subject, body_html=html, body_text=text
            ),
            "whatsapp_params": [
                invoice_number,
                party_name,
                f"Rs. {amount:,.2f}",
                payment_date,
            ],
            "in_app_title": f"Payment Rs. {amount:,.2f} Received",
            "in_app_message": f"Payment from {party_name} for Invoice #{invoice_number}",
            "in_app_type": "success",
        }

    @staticmethod
    def low_stock_alert(
        product_name: str,
        sku: str,
        current_qty: float,
        reorder_level: float,
        warehouse_name: str = "",
    ) -> dict[str, Any]:
        subject = f"Low Stock Alert: {product_name} ({sku})"
        html = f"""
        <html>
        <body style="font-family: Arial, sans-serif; color: #333;">
            <h2 style="color: #dc3545;">Low Stock Alert</h2>
            <table style="border-collapse: collapse; width: 100%; max-width: 500px;">
                <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><b>Product</b></td><td style="padding: 8px; border-bottom: 1px solid #eee;">{product_name}</td></tr>
                <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><b>SKU</b></td><td style="padding: 8px; border-bottom: 1px solid #eee;">{sku}</td></tr>
                <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><b>Current Stock</b></td><td style="padding: 8px; border-bottom: 1px solid #eee; color: #dc3545; font-weight: bold;">{current_qty:,.2f}</td></tr>
                <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><b>Reorder Level</b></td><td style="padding: 8px; border-bottom: 1px solid #eee;">{reorder_level:,.2f}</td></tr>
                <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><b>Warehouse</b></td><td style="padding: 8px; border-bottom: 1px solid #eee;">{warehouse_name}</td></tr>
            </table>
            <p style="margin-top: 20px; color: #dc3545; font-weight: bold;">Action Required: Please reorder stock immediately.</p>
            <p style="margin-top: 10px; color: #888; font-size: 12px;">This is an automated notification from Micro ERP.</p>
        </body>
        </html>
        """
        text = f"LOW STOCK: {product_name} ({sku}). Current: {current_qty:,.2f}, Reorder Level: {reorder_level:,.2f}. Warehouse: {warehouse_name}"

        return {
            "email": EmailMessage(
                to="", subject=subject, body_html=html, body_text=text
            ),
            "whatsapp_params": [
                product_name,
                sku,
                str(int(current_qty)),
                str(int(reorder_level)),
            ],
            "in_app_title": f"Low Stock: {product_name}",
            "in_app_message": f"Stock for {sku} is {current_qty:,.0f} (reorder level: {reorder_level:,.0f})",
            "in_app_type": "warning",
        }

    @staticmethod
    def production_completed(
        production_number: str,
        product_name: str,
        planned_qty: float,
        completed_qty: float,
        rejected_qty: float = 0,
        completion_date: str = "",
    ) -> dict[str, Any]:
        subject = f"Production Completed: {production_number}"
        efficiency = (completed_qty / planned_qty * 100) if planned_qty > 0 else 0
        html = f"""
        <html>
        <body style="font-family: Arial, sans-serif; color: #333;">
            <h2 style="color: #1a1a2e;">Production Order Completed</h2>
            <table style="border-collapse: collapse; width: 100%; max-width: 500px;">
                <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><b>Production No.</b></td><td style="padding: 8px; border-bottom: 1px solid #eee;">{production_number}</td></tr>
                <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><b>Product</b></td><td style="padding: 8px; border-bottom: 1px solid #eee;">{product_name}</td></tr>
                <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><b>Planned Qty</b></td><td style="padding: 8px; border-bottom: 1px solid #eee;">{planned_qty:,.0f}</td></tr>
                <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><b>Completed Qty</b></td><td style="padding: 8px; border-bottom: 1px solid #eee; color: #28a745; font-weight: bold;">{completed_qty:,.0f}</td></tr>
                <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><b>Rejected Qty</b></td><td style="padding: 8px; border-bottom: 1px solid #eee; color: #dc3545;">{rejected_qty:,.0f}</td></tr>
                <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><b>Efficiency</b></td><td style="padding: 8px; border-bottom: 1px solid #eee;">{efficiency:.1f}%</td></tr>
                <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><b>Completion Date</b></td><td style="padding: 8px; border-bottom: 1px solid #eee;">{completion_date}</td></tr>
            </table>
            <p style="margin-top: 20px; color: #888; font-size: 12px;">This is an automated notification from Micro ERP.</p>
        </body>
        </html>
        """
        text = f"Production {production_number} completed. Product: {product_name}. Completed: {completed_qty:,.0f}/{planned_qty:,.0f}. Rejected: {rejected_qty:,.0f}. Efficiency: {efficiency:.1f}%"

        return {
            "email": EmailMessage(
                to="", subject=subject, body_html=html, body_text=text
            ),
            "whatsapp_params": [
                production_number,
                product_name,
                f"{completed_qty:,.0f}",
                f"{efficiency:.1f}%",
            ],
            "in_app_title": f"Production {production_number} Completed",
            "in_app_message": f"{product_name}: {completed_qty:,.0f}/{planned_qty:,.0f} completed ({efficiency:.1f}% efficiency)",
            "in_app_type": "success",
        }
