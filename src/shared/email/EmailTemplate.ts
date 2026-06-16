export interface BrandedEmailInput {
	heading: string;
	paragraphs: string[];
	cta?: { label: string; url: string };
}

export function renderBrandedEmail({ heading, paragraphs, cta }: BrandedEmailInput): { html: string; text: string } {
	const paragraphsHtml = paragraphs
		.map((p) => `<p style="font-size:15px;line-height:1.6;color:#555555;margin:0 0 14px 0;padding:0">${p}</p>`)
		.join("\n\t\t\t\t\t\t\t");

	const ctaHtml = cta
		? `
							<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 8px 0">
								<tr>
									<td align="center">
										<table cellpadding="0" cellspacing="0" border="0">
											<tr>
												<td bgcolor="#2d6ade" style="border-radius:8px">
													<a href="${cta.url}" target="_blank" style="display:inline-block;padding:12px 28px;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;font-family:Arial,Helvetica,sans-serif">${cta.label}</a>
												</td>
											</tr>
										</table>
									</td>
								</tr>
							</table>`
		: "";

	const html = `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background-color:#0d0d0d">
	<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0d0d0d" style="background-color:#0d0d0d">
		<tr>
			<td align="center" style="padding:32px 16px">
				<table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;mso-border-alt:none">
					<!-- Header -->
					<tr>
						<td bgcolor="#1a1a1a" align="center" style="padding:28px 32px;background-color:#1a1a1a">
							<span style="font-family:Arial,Helvetica,sans-serif;font-size:20px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#ffffff">EVOLUTION</span>
						</td>
					</tr>
					<!-- Accent bar -->
					<tr>
						<td style="padding:0;line-height:0;font-size:0" height="4">
							<table width="100%" cellpadding="0" cellspacing="0" border="0" style="height:4px">
								<tr>
									<td width="50%" bgcolor="#2d6ade" height="4" style="height:4px;line-height:4px;font-size:1px">&nbsp;</td>
									<td width="50%" bgcolor="#bd24df" height="4" style="height:4px;line-height:4px;font-size:1px">&nbsp;</td>
								</tr>
							</table>
						</td>
					</tr>
					<!-- Body -->
					<tr>
						<td bgcolor="#ffffff" style="padding:32px;background-color:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a">
							<h1 style="font-size:22px;font-weight:700;margin:0 0 16px 0;padding:0;color:#1a1a1a;font-family:Arial,Helvetica,sans-serif">${heading}</h1>
							${paragraphsHtml}
							${ctaHtml}
						</td>
					</tr>
					<!-- Footer -->
					<tr>
						<td bgcolor="#f4f4f5" align="center" style="padding:24px 32px;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#888888">
							Evolution &mdash; <a href="https://evolutionygo.com" target="_blank" style="color:#2d6ade;text-decoration:none">evolutionygo.com</a>
						</td>
					</tr>
				</table>
			</td>
		</tr>
	</table>
</body>
</html>`;

	const ctaText = cta ? `\n\n${cta.label}: ${cta.url}` : "";
	const text = `${heading}\n\n${paragraphs.join("\n\n")}${ctaText}\n\nEvolution — https://evolutionygo.com`;

	return { html, text };
}
